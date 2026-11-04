# ATLAS

A firewall for AI agents. It stops hidden instructions in documents, pages and tool results from turning into actions, and it comes with an arena where you can try to beat it.

AI agents read everything as one stream of text, so they can't reliably tell your instructions from text they happen to read. Ask one to summarize a PDF, and a hidden line in that PDF can tell it to email your data to someone else. This is indirect prompt injection.

ATLAS sits between an agent and its tools. Point the agent's `base_url` at it:

```python
client = OpenAI(
    base_url="https://your-atlas-gateway/v1",
    api_key=ATLAS_GATEWAY_KEY,
    default_headers={"X-Atlas-Session": session_id},
)
```

**Status: in active development.** The firewall, arena and site run locally. There's no public deployment yet, and the evaluation on real models is still running.

## How it works

Going in, untrusted text gets labelled, cleaned and wrapped in random delimiters. Coming out, every tool call passes these checks in order:

| Layer | What it does | How it can fail |
|---|---|---|
| Schema | Strict types, no extra arguments, unknown tools denied | Only checks shape |
| Structure | Parses SQL and URLs instead of matching strings. Blocks writes, private IPs and encoded data in URLs | Allowed destinations stay allowed |
| Origin | Did this email address or URL come from the user, or only from untrusted text? | Addresses in your own database count as trusted |
| Canary | A per-session fake secret. If it moves, the call dies | Stealing only the real secret won't trip it |
| Causal replay | Re-asks the model without the untrusted text. If the call disappears, that text caused it | Costs extra model calls and can block tasks that rightly depend on a document |

Each layer has a switch, which is how the arena levels and experiments work. If a check crashes, the gateway returns an error rather than the model's reply.

**No known defense stops all prompt injection, including this one.** ATLAS aims to lower the odds and limit the damage.

## Measured results

Every number comes from a saved report in `eval/reports/`. These are small, early runs with no firewall, so they measure the attacks and models rather than ATLAS. Code decides whether a secret leaked, not an LLM judge.

| Model | Basic attacks leaked | Harder attacks leaked | Normal tasks done |
|---|---|---|---|
| `lfm2.5:8b` (local) | 0 of 10 | 3 of 6 | 10 of 10 |
| `nemotron-3.5-super` (free tier) | 0 of 10 | not finished | 10 of 10 |
| `gemini-3.6-flash` (free tier) | not finished | 0 of 5 | not finished |
| `llama3.2:3b` (local) | 0 of 10 | not run | 1 of 10, too weak to use its tools |

The firewall-on comparison is running. Results will appear in `eval/reports/` and on the site's scoreboard, including anything it fails to stop.

The arena also has a clearly labelled scripted demo model, so it runs without an API key. Its outcomes show how the layers work, not how real models behave.

## Run it

Needs Python 3.11+ and Node 18+.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m pytest
```

Start the arena with the scripted model:

```bash
.venv/Scripts/python -m uvicorn --factory arena.api:main_app --port 8000
```

In a second terminal, start the site and open http://localhost:5173:

```bash
npm --prefix web install
npm --prefix web run dev
```

Use a real model by setting the variables in `.env.example`. To measure one:

```bash
.venv/Scripts/python -m eval.baseline --suite strong --base-url URL --model NAME
.venv/Scripts/python -m eval.ablation --suite strong --base-url URL --model NAME
.venv/Scripts/python -m eval.h1_spike --base-url URL --model NAME
.venv/Scripts/python -m eval.scoreboard
```

To protect your own agent, start the gateway. It refuses to start without `ATLAS_GATEWAY_KEY`:

```bash
.venv/Scripts/python -m uvicorn --factory gateway.app:main_app --port 8001
```

## What's in the repo

```
atlas/     core: ingest, sanitize, taint, canary, causal, policy, firewall, trace
gateway/   OpenAI-compatible proxy
arena/     mocked company, leak oracle, levels, public API, recordings
redteam/   mutation fuzzer, PAIR attacker, Immune System draft fixes
eval/      scenarios, baselines, layer on/off runner, repeated-attack spike, scoreboard
policies/  YAML firewall rules
web/       site: landing, arena, replay, scoreboard, scanner, paper
```

## Research question

Do leave-one-out causal defenses fail when the same attack is repeated across several sources, and does removing sources in groups fix that at acceptable cost? This builds on CausalArmor, AttriGuard, AgentSentry and MELON. It isn't answered yet.

## Known limits

- Replay keeps earlier hijacked turns in history, which can bias its verdict.
- The gateway buffers replies, so streaming clients get one large chunk.
- The leak oracle and canary scanner recognize base64, hex, URL encoding, reversal and separators. Other encodings are missed.
- Rule-based cleaning only catches lazy attacks and can be bypassed by rephrasing, which is why the outbound checks exist.
- The injection classifier in the design isn't built yet.
- The scanner's grade is a rough guess from tool names and descriptions.

## Safety

All arena tools are mocked and all secrets are fake. Only run the red-team tools against this sandbox or systems you own.

## Credits

The site's scroll-flight engine in `web/src/components/SkyWorld.jsx` is adapted from TrustCheck by Team Semicolons, built for D3COY 2026.
