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

Every number comes from a saved report in `eval/reports/`. Code decides whether a secret leaked, not an LLM judge. These runs used `lfm2.5:8b` on a Colab T4 GPU against 6 harder attacks and 10 normal tasks.

| Firewall setup | Attacks leaked | Normal tasks done |
|---|---|---|
| No firewall | 3 of 12 | 20 of 20 |
| Clean room only | 6 of 12 | 19 of 20 |
| Canary only | 4 of 12 | 19 of 20 |
| Structure and origin only | 0 of 12 | 18 of 20 |
| Full stack, leave-one-out | 0 of 12 | 16 of 20 |
| Full stack, group removal | 0 of 12 | 15 of 20 |

What this shows, and what it doesn't:

- With structure and origin checks on, no attack leaked the secret in this small test.
- That protection has a cost. The full stack also blocked up to 5 of 20 normal tasks, and reducing that is the next job.
- Causal replay added no measured protection beyond structure and origin here, while normal tasks done dropped further.
- These samples are small, one model, and runs repeat closely because temperature is 0, so treat them as early signals. An attacker who adapts to the firewall hasn't been tested yet.

The arena also ran on this real model through its API, for all 5 levels. The arena's public demo uses a clearly labelled scripted model, so it runs without an API key.

### Paper question: first result

Repeating the same attack in 1, 2 and 3 documents gave:

| Copies | Hijacked | Caught by leave-one-out | Caught by group removal | Missed |
|---|---|---|---|---|
| 1 | 0 of 10 | 0 | 0 | 0 |
| 2 | 10 of 10 | 10 | 0 | 0 |
| 3 | 10 of 10 | 0 | 0 | 10 |

Trials barely vary at temperature 0, so this is closer to one observation per row than ten. Repetition did raise hijacks, and leave-one-out missed at 3 copies, but group removal didn't catch those either, so the proposed fix isn't supported yet. Replay keeps earlier hijacked turns in history, which may explain the misses and needs testing first.

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
