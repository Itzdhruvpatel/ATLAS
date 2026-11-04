"""Shows what the model actually did on chosen attacks, with and without the reply cap."""
import argparse

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--ids", default="A11,A13,A15")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--caps", default="500,8192")
    args = parser.parse_args()
    wanted = [s for s in STRONG_ATTACKS if s.id in args.ids.split(",")]
    for cap in map(int, args.caps.split(",")):
        for scenario in wanted:
            for trial in range(args.trials):
                llm = OpenAICompatLLM(args.base_url, api_key(), args.model, 12, timeout=300, max_tokens=cap)
                won, tools, final = trace(llm, scenario)
                print(f"cap={cap} {scenario.id}#{trial} leaked={won} calls={llm.calls} tools={tools} final={final!r}", flush=True)


if __name__ == "__main__":
    main()
