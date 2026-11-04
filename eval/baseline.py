import argparse
import json
import random
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

from arena.agent import run_agent
from arena.llm import BudgetExceeded, OpenAICompatLLM, api_key
from arena.world import World
from eval.scenarios import ATTACKS, BENIGN

REPORTS = Path(__file__).parent / "reports"


def bootstrap_ci(outcomes, samples=2000, seed=0):
    if not outcomes:
        return (None, None)
    rng = random.Random(seed)
    rates = sorted(sum(rng.choices(outcomes, k=len(outcomes))) / len(outcomes) for _ in range(samples))
    return (rates[int(samples * 0.025)], rates[int(samples * 0.975) - 1])


def _run_suite(llm, scenarios, runs):
    outcomes, per_scenario, errors = [], {}, 0
    for scenario in scenarios:
        for _ in range(runs):
            world = World(documents=scenario.documents, pages=scenario.pages)
            try:
                result = bool(scenario.check(world, run_agent(llm, world, scenario.user_task)))
            except httpx.HTTPError as e:
                print(f"{scenario.id}: {e}", file=sys.stderr)
                errors += 1
                continue
            outcomes.append(result)
            per_scenario.setdefault(scenario.id, []).append(result)
    low, high = bootstrap_ci(outcomes)
    return {
        "rate": sum(outcomes) / len(outcomes) if outcomes else None,
        "ci95": [low, high],
        "n": len(outcomes),
        "errors": errors,
        "per_scenario": per_scenario,
    }


def evaluate(llm, attacks, benign, runs):
    report = {"complete": True, "attack": None, "benign": None}
    for name, scenarios in (("attack", attacks), ("benign", benign)):
        try:
            report[name] = _run_suite(llm, scenarios, runs)
        except BudgetExceeded as e:
            print(f"Stopped: {e}", file=sys.stderr)
            report["complete"] = False
            break
    return report


def git_commit():
    result = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return result.stdout.strip() or "uncommitted"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--max-llm-calls", type=int, default=300)
    parser.add_argument("--timeout", type=float, default=60, help="seconds per LLM call; raise for local CPU models")
    args = parser.parse_args()

    llm = OpenAICompatLLM(args.base_url, api_key(), args.model, args.max_llm_calls, timeout=args.timeout)
    report = evaluate(llm, ATTACKS, BENIGN, args.runs)
    report.update(
        model=args.model, temperature=llm.temperature, runs=args.runs,
        llm_calls=llm.calls, commit=git_commit(),
        finished=datetime.now(timezone.utc).isoformat(),
    )
    REPORTS.mkdir(exist_ok=True)
    path = REPORTS / f"baseline-{re.sub(r'[^A-Za-z0-9._-]', '_', args.model)}-{report['commit']}.json"
    path.write_text(json.dumps(report, indent=2))
    print(f"{path}\nattack={report['attack'] and report['attack']['rate']} benign={report['benign'] and report['benign']['rate']} calls={llm.calls}")


if __name__ == "__main__":
    main()
