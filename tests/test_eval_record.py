import json

from arena.record import ATTACKS as RECORDED, record, record_lab, scripted_victim
from eval.ablation import CONFIGS, ablation, run_scenario
from eval.scenarios import ATTACKS
from eval.scoreboard import build
from tests.fake import EvilLLM, final


def test_recordings_show_every_layer_story_and_are_labelled():
    data = record(scripted_victim, "scripted demo", True)
    outcomes = [(r["level"], r["won"], r["blocked_by"]) for r in data["runs"]]
    assert outcomes[0] == (1, True, None)
    assert outcomes[1][1] is False
    assert outcomes[2] == (3, False, "origin")
    assert outcomes[3] == (3, True, None)
    assert outcomes[4] == (5, False, "causal")
    assert all(r["scripted"] for r in data["runs"])
    assert sum(r["featured"] for r in data["runs"]) == 1
    assert len(data["runs"]) == len(RECORDED)


def test_ablation_covers_every_config():
    rows = ablation(lambda m, t: final("nothing"), configs=CONFIGS, attacks=ATTACKS[:1], benign=[])
    assert [r["config"] for r in rows] == list(CONFIGS)
    assert all(r["attack"]["rate"] == 0.0 for r in rows)


def test_no_firewall_leaks_and_full_stack_does_not():
    assert run_scenario(ATTACKS[0], EvilLLM(), CONFIGS["No firewall"])
    assert not run_scenario(ATTACKS[0], EvilLLM(), CONFIGS["Full stack, group removal"])


def test_scoreboard_only_uses_complete_reports(tmp_path):
    good = {"complete": True, "model": "m", "commit": "c",
            "attack": {"rate": 0.5, "ci95": [0, 1], "n": 2, "errors": 0, "per_scenario": {}},
            "benign": {"rate": 1.0, "ci95": [1, 1], "n": 2, "errors": 0, "per_scenario": {}}}
    (tmp_path / "baseline-a.json").write_text(json.dumps(good))
    (tmp_path / "baseline-b.json").write_text(json.dumps({**good, "complete": False, "model": "partial"}))
    runs = build(tmp_path)["runs"]
    assert [r["model"] for r in runs] == ["m"]
    assert "per_scenario" not in runs[0]["attack"]


def test_lab_runs_every_layer_combination_for_real():
    lab = record_lab(scripted_victim, "scripted demo")
    assert len(lab["results"]) == len(lab["attacks"]) * 32
    off, full = "00000", "11111"
    for attack in lab["attacks"]:
        assert lab["results"][f"{attack['key']}:{off}"]["won"], attack["key"]
        assert not lab["results"][f"{attack['key']}:{full}"]["won"], attack["key"]
    # origin alone stops the attacker's own address but not a trusted one, which the page's text claims
    assert not lab["results"]["plain:00100"]["won"]
    assert lab["results"]["trusted:11100"]["won"]
    assert not lab["results"]["trusted:11101"]["won"]
    assert lab["results"]["dump:11110"]["blocked_by"] == "canary"


def test_arena_check_plays_every_level_through_the_api():
    from eval.arena_check import LEVELS, check
    from tests.test_gateway_arena import PAYLOAD, Hijackable

    rows = check(Hijackable(), "test-model", document=PAYLOAD)
    assert [r["level"] for r in rows] == list(LEVELS)
    assert all(r["status"] == 200 for r in rows)
    assert rows[0]["won"] is True
    assert rows[2]["won"] is False
