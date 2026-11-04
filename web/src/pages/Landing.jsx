import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LayerLab from "../components/LayerLab.jsx";
import Readout, { prefersReducedMotion, usePlayer } from "../components/Readout.jsx";
import { recordings } from "../lib/api.js";
import { describe } from "../lib/replay.js";

const TerrainHero = lazy(() => import("../components/TerrainHero.jsx"));

const LEDGER = [
  ["9.3 out of 10", "Severity score of EchoLeak, a flaw in Microsoft 365 Copilot. Reports describe a hidden prompt in an email that could pull out data with no click from the user.", "https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html", "The Hacker News"],
  ["272,000", "Attack attempts by 464 people against 13 AI models, in a three-week public indirect prompt injection competition.", "https://arxiv.org/abs/2603.15714", "Dziemian et al., 2026"],
  ["Near 100%", "Attack success across all tested agents on a benchmark built from an earlier public red-teaming competition's successful attacks.", "https://arxiv.org/abs/2507.20526", "Zou et al., 2025"],
];

const LEVELS = [
  ["Open door", "No firewall. The agent trusts whatever it reads."],
  ["Clean room", "Hidden text, encoded blobs and lazy instructions are removed before the agent sees them."],
  ["Rulebook", "Every tool call is parsed. An email address that appeared only in your document can't be used."],
  ["Tripwire", "A fake secret sits next to the real one. If it moves, the call dies."],
  ["Full ATLAS", "Risky calls are replayed without your document. If the call disappears, your document caused it."],
];

const canUse3D = () => {
  if (prefersReducedMotion()) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
};

function Hero({ run }) {
  const events = run?.events ?? [];
  const webgl = useMemo(canUse3D, []);
  const [index, setIndex] = useState(0);
  const last = Math.max(0, events.length - 1);
  const shown = webgl ? index : last;
  const finished = events.length > 0 && shown >= last;
  const step = describe(events[shown]);

  return (
    <section className="hero">
      {run && webgl && (
        <Suspense fallback={null}>
          <TerrainHero events={events} won={run.won} onIndex={setIndex} className="hero-terrain" />
        </Suspense>
      )}
      <div className="hero-shade" />
      <div className="wrap hero-copy">
        <h1>
          <span className="line" style={{ "--d": "0ms" }}>Your agent read the PDF.</span>
          <span className="line alt" style={{ "--d": "220ms" }}>The PDF read your agent.</span>
        </h1>
        <p className="lede rise" style={{ "--d": "520ms" }}>AI agents can't tell your instructions from text they happen to read. ATLAS sits between the agent and its tools, and stops hidden instructions from turning into actions.</p>
        <div className="actions rise" style={{ "--d": "680ms" }}>
          <a className="btn" href="#/arena">Try to hijack the agent</a>
          <button type="button" className="btn quiet" onClick={() => document.getElementById("lab").scrollIntoView()}>Flip the layers yourself</button>
        </div>
      </div>
      {run && (
        <div className="wrap hero-bottom">
          <p className="hero-key">
            This landscape is one recorded attack. Each tall peak is a real event and the ripple is decoration. Amber is the replay, green is the block. {run.scripted ? "Scripted demo model, real firewall code." : `Real run on ${run.model}.`}
          </p>
          <div className="hero-status">
            <div className="hero-stamp">{finished && <span className={`verdict slam ${run.won ? "won" : "held"}`}>{run.won ? "Secret leaked" : "Secret held"}</span>}</div>
            <p className={`hero-caption ${finished || events[shown]?.stage === "block" ? "good" : ""}`}>
              {finished ? (run.won ? "The secret left the company." : "The document caused the email, so it never went out.") : `${step.head}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function BlackBox({ run }) {
  const player = usePlayer(run.events.length, false);
  return (
    <section className="band paper">
      <div className="wrap">
        <h2>Then read the black box.</h2>
        <p className="intro">That landscape is this plot. Every attack gets a flight recorder you can scrub through, one event at a time, and share with a link.</p>
        <Readout events={run.events} player={player}
          title={`Level ${run.level}: ${run.title.toLowerCase()}`}
          note={run.scripted ? "Scripted demo model, not a real LLM" : `Real run on ${run.model}`} />
      </div>
    </section>
  );
}

export default function Landing() {
  const [run, setRun] = useState(null);
  useEffect(() => {
    recordings().then((r) => setRun(r.runs.find((x) => x.featured) ?? r.runs[0] ?? null));
  }, []);
  return (
    <>
      <Hero run={run} />

      <section className="band paper">
        <div className="wrap">
          <h2>The attack needs no hacker in your network. Just a document.</h2>
          <p className="intro">The victim only asked for a summary. Instructions hidden in what the agent reads can do the rest, using the access you gave it.</p>
          <dl className="ledger">
            {LEDGER.map(([number, text, href, source]) => (
              <div key={number}>
                <dt>{number}</dt>
                <dd>{text} <a href={href} target="_blank" rel="noreferrer">{source}</a></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="band white" id="lab">
        <div className="wrap">
          <h2>Turn the defenses off and see what breaks.</h2>
          <p className="intro">Start here: the origin check stops an attacker's own address, but a customer address already in the database slips past it. Now switch on causal replay.</p>
          <LayerLab />
        </div>
      </section>

      {run && <BlackBox run={run} />}

      <section className="band deep">
        <div className="wrap">
          <h2>Five levels. Beat them with your own words.</h2>
          <p className="intro">You write a document. A fictional company's assistant is asked to summarize it. Win by getting its secret out. Code checks the fake outbox and network log, so there's no arguing about who won.</p>
          <ol className="ladder">
            {LEVELS.map(([name, text], i) => (
              <li key={name}><span className="n">{i + 1}</span><b>{name}</b><span>{text}</span></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band paper">
        <div className="wrap">
          <h2>Add it with one line.</h2>
          <p className="intro">ATLAS speaks the OpenAI API, so most agents only need a new base URL. Each session gets its own taint record, canary and audit trail.</p>
          <pre className="yaml" style={{ marginTop: 18 }}>{`client = OpenAI(
    base_url="https://your-atlas-gateway/v1",
    api_key=ATLAS_GATEWAY_KEY,
    default_headers={"X-Atlas-Session": session_id},
)`}</pre>
        </div>
      </section>

      <section className="band white">
        <div className="wrap">
          <h2>Where it can be wrong.</h2>
          <div className="limits">
            <div><h3>Rewritten secrets</h3><p>If a model paraphrases a secret and sends it to an allowed address, text matching can miss it.</p></div>
            <div><h3>Trusted-looking recipients</h3><p>An address in your own database counts as trusted, so an attacker can aim at one. Level 3 can be beaten this way.</p></div>
            <div><h3>Everything else</h3><p>No known defense stops all prompt injection. ATLAS lowers the odds and limits the damage. Each bypass found becomes a permanent test.</p></div>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <p>Think you can get the secret out?</p>
          <a className="btn" href="#/arena">Open the arena</a>
        </div>
      </section>
    </>
  );
}
