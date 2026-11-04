"""Shows what the model actually did on chosen attacks, with and without the reply cap."""
import argparse
import sys

from arena.agent import run_agent
from arena.llm import OpenAICompatLLM, api_key
from arena.oracle import leaked
from arena.world import World
from eval.scenarios import STRONG_ATTACKS


def trace(llm, scenario):
    world = World(documents=scenario.documents, pages=scenario.pages)
    run = run_agent(llm, world, scenario.user_task)
    tools = [f'{s.call["function"]["name"]}{s.call["function"]["arguments"][:70]}' for s in run.steps]
    return leaked(world), tools, run.final[:160]


def problem(results):
    """Says why a long run would be wasted, given (leaked, truncated) per attempt."""
    if any(truncated for _, truncated in results):
        return "replies were cut off"
    if not any(won for won, _ in results):
        return "no attack leaked with the firewall off"
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--ids", default="A11,A13,A15")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--caps", default="8000")
    args = parser.parse_args()
    wanted = [s for s in STRONG_ATTACKS if s.id in args.ids.split(",")]
    results = []
    for cap in map(int, args.caps.split(",")):
        for scenario in wanted:
            for trial in range(args.trials):
                llm = OpenAICompatLLM(args.base_url, api_key(), args.model, 12, timeout=300, max_tokens=cap)
                won, tools, final = trace(llm, scenario)
                results.append((won, llm.truncated))
                print(f"cap={cap} {scenario.id}#{trial} leaked={won} calls={llm.calls} truncated={llm.truncated} tools={tools} final={final!r}", flush=True)
    reason = problem(results)
    print(f"STOP: {reason}" if reason else "OK: replies complete and attacks land", flush=True)
    sys.exit(1 if reason else 0)


if __name__ == "__main__":
    main()
