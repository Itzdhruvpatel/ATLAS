import copy
import json
from dataclasses import dataclass, field
from urllib.parse import urlsplit

PLACEHOLDER = "[content removed]"
UNTRUSTED_TOOLS = {"read_document", "http_fetch"}
SURVIVES = 0.5


@dataclass
class Attribution:
    verdict: str
    stage: str | None = None
    leave_one_out: dict = field(default_factory=dict)
    group_survival: float | None = None


def untrusted_indexes(messages):
    names = {
        call["id"]: call["function"]["name"]
        for m in messages
        for call in m.get("tool_calls") or []
    }
    return [
        i for i, m in enumerate(messages)
        if m["role"] == "tool" and names.get(m.get("tool_call_id")) in UNTRUSTED_TOOLS
    ]


def fingerprint(call):
    name = call["function"]["name"]
    try:
        args = json.loads(call["function"]["arguments"])
    except json.JSONDecodeError:
        return (name, "malformed")
    if not isinstance(args, dict):
        return (name, "malformed")
    if name == "send_email":
        to = args.get("to", [])
        recipients = to if isinstance(to, list) else [to]
        return (name, tuple(sorted(str(r).strip().lower() for r in recipients)))
    if name == "http_fetch":
        return (name, urlsplit(str(args.get("url", ""))).hostname)
    return (name, json.dumps(args, sort_keys=True))


def _survival(llm, messages, tools, target, removed, runs):
    context = copy.deepcopy(messages)
    for i in removed:
        context[i]["content"] = PLACEHOLDER
    hits = 0
    for _ in range(runs):
        reply = llm(context, tools)
        hits += any(fingerprint(c) == target for c in reply.get("tool_calls") or [])
    return hits / runs


# ponytail: single-step teacher-forced replay. Earlier hijacked assistant turns stay in
# the history and can bias survival upward. Measure that before trusting verdicts.
def attribute(llm, messages, tools, call, runs=3, max_chunks=5):
    chunks = untrusted_indexes(messages)
    if not chunks:
        return Attribution("user-driven")
    if len(chunks) > max_chunks:
        return Attribution("inconclusive")

    target = fingerprint(call)
    loo = {i: _survival(llm, messages, tools, target, [i], runs) for i in chunks}
    if min(loo.values()) < SURVIVES:
        return Attribution("untrusted-driven", "leave_one_out", loo)

    group = _survival(llm, messages, tools, target, chunks, runs)
    if group < SURVIVES:
        return Attribution("untrusted-driven", "group", loo, group)
    return Attribution("user-driven", None, loo, group)
