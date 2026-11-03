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
    causing: list = field(default_factory=list)
    llm_calls: int = 0


def untrusted_indexes(messages, untrusted_tools=UNTRUSTED_TOOLS):
    names = {
        call["id"]: call["function"]["name"]
        for m in messages
        for call in m.get("tool_calls") or []
    }
    return [
        i for i, m in enumerate(messages)
        if m["role"] == "tool" and names.get(m.get("tool_call_id")) in untrusted_tools
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


class _Replay:
    def __init__(self, llm, messages, tools, call, runs):
        self.llm, self.messages, self.tools, self.runs = llm, messages, tools, runs
        self.target = fingerprint(call)
        self.calls = 0

    def survival(self, removed):
        context = copy.deepcopy(self.messages)
        for i in removed:
            context[i]["content"] = PLACEHOLDER
        hits = 0
        for _ in range(self.runs):
            self.calls += 1
            reply = self.llm(context, self.tools)
            hits += any(fingerprint(c) == self.target for c in reply.get("tool_calls") or [])
        return hits / self.runs


def _minimal_set(replay, chunks):
    needed = list(chunks)
    for i in chunks:
        trial = [c for c in needed if c != i]
        if trial and replay.survival(trial) < SURVIVES:
            needed = trial
    return needed


# ponytail: single-step teacher-forced replay. Earlier hijacked assistant turns stay in
# the history and can bias survival upward. Measure that before trusting verdicts.
def attribute(llm, messages, tools, call, runs=3, max_chunks=5, untrusted_tools=UNTRUSTED_TOOLS, group_removal=True):
    chunks = untrusted_indexes(messages, untrusted_tools)
    if not chunks:
        return Attribution("user-driven")
    if len(chunks) > max_chunks:
        return Attribution("inconclusive")

    replay = _Replay(llm, messages, tools, call, runs)
    loo = {i: replay.survival([i]) for i in chunks}
    causing = [i for i, rate in loo.items() if rate < SURVIVES]
    if causing:
        return Attribution("untrusted-driven", "leave_one_out", loo, causing=causing, llm_calls=replay.calls)
    if not group_removal:
        return Attribution("user-driven", None, loo, llm_calls=replay.calls)

    group = replay.survival(chunks)
    if group >= SURVIVES:
        return Attribution("user-driven", None, loo, group, llm_calls=replay.calls)
    needed = _minimal_set(replay, chunks)
    return Attribution("untrusted-driven", "group", loo, group, needed, replay.calls)
