"""Runs the suites with each firewall layer on and off. Every output number comes from here."""
import argparse
import json
import re
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

from arena.agent import run_agent
from arena.llm import BudgetExceeded, OpenAICompatLLM, api_key
from arena.world import World
from atlas.firewall import Firewall, Layers
from atlas.policy import Policy
from eval.baseline import REPORTS, bootstrap_ci, git_commit
from eval.scenarios import ATTACKS, BENIGN, STRONG_ATTACKS

POLICY = Policy.load(Path(__file__).parent.parent / "policies" / "arena.yaml")
_OFF = dict(ingest=False, structure=False, origin=False, canary=False, causal=False, group_removal=False)
CONFIGS = {
    "No firewall": Layers.off(),
    "Clean room only": Layers(**{**_OFF, "ingest": True}),
    "Structure and origin only": Layers(**{**_OFF, "structure": True, "origin": True}),
    "Canary only": Layers(**{**_OFF, "canary": True}),
    "Full stack, leave-one-out": Layers(group_removal=False),
    "Full stack, group removal": Layers(),
}


def run_scenario(scenario, llm, layers, policy=POLICY, replay_runs=1):
    world = World(documents=scenario.documents, pages=scenario.pages)
    firewall = Firewall(policy, layers, llm=llm, replay_runs=replay_runs)
    run = run_agent(lambda m, t: firewall.complete("s", m, t, llm), world, scenario.user_task)
    return bool(scenario.check(world, run))


def suite(scenarios, llm, layers, runs):
    outcomes, errors = [], 0
    for scenario in scenarios:
        for _ in range(runs):
            try:
                outcomes.append(run_scenario(scenario, llm, layers))
                print(f"  {scenario.id}: {outcomes[-1]}", flush=True)
            except httpx.HTTPError:
                errors += 1
    low, high = bootstrap_ci(outcomes)
    return {"rate": sum(outcomes) / len(outcomes) if outcomes else None, "ci95": [low, high], "n": len(outcomes), "errors": errors}


def ablation(llm, runs=1, configs=CONFIGS, attacks=ATTACKS, benign=BENIGN):
    return list(ablation_rows(llm, runs, configs, attacks, benign))


def ablation_rows(llm, runs, configs, attacks, benign):
    for name, layers in configs.items():
        yield {"config": name, "layers": asdict(layers), "attack": suite(attacks, llm, layers, runs), "benign": suite(benign, llm, layers, runs)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--max-llm-calls", type=int, default=1500)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--suite", choices=["basic", "strong"], default="basic")
    args = parser.parse_args()
    llm = OpenAICompatLLM(args.base_url, api_key(), args.model, args.max_llm_calls, timeout=args.timeout)
    attacks = STRONG_ATTACKS if args.suite == "strong" else ATTACKS
    report = {"suite": args.suite, "model": args.model, "commit": git_commit(), "complete": False, "replay_runs": 1, "max_tokens": llm.max_tokens, "rows": []}
    path = REPORTS / f"ablation-{args.suite}-{re.sub(r'[^A-Za-z0-9._-]', '_', args.model)}-{report['commit']}.json"
    # Saved after each config, because CPU runs take hours and can be interrupted.
    try:
        for row in ablation_rows(llm, args.runs, CONFIGS, attacks, BENIGN):
            report["rows"].append(row)
            report.update(llm_calls=llm.calls, truncated=llm.truncated, finished=datetime.now(timezone.utc).isoformat())
            path.write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(row["config"], "attack", row["attack"]["rate"], "benign", row["benign"]["rate"], "calls", llm.calls, flush=True)
    except BudgetExceeded as e:
        raise SystemExit(f"Stopped: {e}. Finished configs are saved in {path}.")
    # A setup where every call failed measured nothing, so the run must not count as complete.
    report["complete"] = all(row[k]["n"] or not row[k]["errors"] for row in report["rows"] for k in ("attack", "benign"))
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
