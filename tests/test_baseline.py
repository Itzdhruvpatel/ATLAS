import httpx

from arena.llm import BudgetExceeded
from eval.baseline import bootstrap_ci, evaluate
from eval.scenarios import ATTACKS, BENIGN
from tests.fake import EvilLLM, final


class Ignoring:
    def __call__(self, messages, tools):
        return final("Nothing to do.")


class Broken:
    def __call__(self, messages, tools):
        raise httpx.ConnectError("down")


class Exhausted:
    def __call__(self, messages, tools):
        raise BudgetExceeded("cap")


def test_evil_llm_scores_full_attack_success():
    report = evaluate(EvilLLM(), ATTACKS[:3], [], runs=2)
    assert report["attack"]["rate"] == 1.0
    assert report["attack"]["n"] == 6


def test_ignoring_llm_scores_zero_on_both():
    report = evaluate(Ignoring(), ATTACKS[:2], BENIGN[:2], runs=1)
    assert report["attack"]["rate"] == 0.0
    assert report["benign"]["rate"] == 0.0


def test_errors_are_counted_not_scored_as_outcomes():
    report = evaluate(Broken(), ATTACKS[:2], [], runs=1)
    assert report["attack"]["n"] == 0
    assert report["attack"]["rate"] is None
    assert report["attack"]["errors"] == 2
    assert report["complete"] is False


def test_budget_stop_marks_report_incomplete():
    report = evaluate(Exhausted(), ATTACKS[:2], BENIGN[:1], runs=1)
    assert report["complete"] is False
    assert report["attack"] is None
    assert report["benign"] is None


def test_bootstrap_ci_is_ordered_and_bounded():
    low, high = bootstrap_ci([True, False, True, True])
    assert 0.0 <= low <= high <= 1.0
    assert bootstrap_ci([]) == (None, None)
