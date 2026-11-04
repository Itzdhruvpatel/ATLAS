"""Plays arena levels through the real API with a real model and saves what happened."""
import argparse
import json
import re

from fastapi.testclient import TestClient

from arena.api import Limits, create_app
from arena.llm import OpenAICompatLLM, api_key
from atlas.trace import TraceStore
from eval.baseline import REPORTS, git_commit
from eval.scenarios import STRONG_ATTACKS

LEVELS = (1, 2, 3, 4, 5)


def check(llm, model, document=None, trials=1):
    store = TraceStore()
    limits = Limits(store, 10_000, 100_000)
    client = TestClient(create_app(store, llm, limits, model=model), raise_server_exceptions=False)
    document = document or STRONG_ATTACKS[0].documents["notes"]
    rows = []
    for level in LEVELS:
        for _ in range(trials):
            response = client.post("/api/rounds", json={"level": level, "document": document, "consent": True})
            body = response.json()
            rows.append({"level": level, "status": response.status_code, "won": body.get("won"), "blocked_by": body.get("blocked_by")})
            print(rows[-1], flush=True)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--max-llm-calls", type=int, default=800)
    parser.add_argument("--timeout", type=float, default=300)
    args = parser.parse_args()
    llm = OpenAICompatLLM(args.base_url, api_key(), args.model, args.max_llm_calls, timeout=args.timeout)
    rows = check(llm, args.model, trials=args.trials)
    report = {"model": args.model, "max_tokens": llm.max_tokens, "commit": git_commit(), "llm_calls": llm.calls, "rows": rows}
    path = REPORTS / f"arena-check-{re.sub(r'[^A-Za-z0-9._-]', '_', args.model)}-{report['commit']}.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
