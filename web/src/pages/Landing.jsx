import { useEffect, useState } from "react";
import Readout, { Annunciators, usePlayer } from "../components/Readout.jsx";
import { recordings } from "../lib/api.js";

const LEVELS = [
  ["Open door", "No firewall. The agent trusts whatever it reads, so a plain request usually works."],
  ["Clean room", "Hidden text, encoded blobs and lazy instructions are removed before the agent sees them."],
  ["Rulebook", "Every tool call is parsed. An email address that appeared only in your document can't be used."],
  ["Tripwire", "A fake secret sits next to the real one. If it moves, the call dies."],
  ["Full ATLAS", "Risky calls are replayed without your document. If the call disappears, your document caused it."],
];

function Hero({ run }) {
  const events = run?.events ?? [];
  const player = usePlayer(events.length, true);
  return (
    <section className="hero wrap">
      <div className="hero-top">
        <div>
          <h1>Your agent read the PDF. The PDF read your agent.</h1>
          <p className="lede">AI agents can't tell your instructions from text they happen to read. ATLAS sits between the agent and its tools, and stops hidden instructions from turning into actions.</p>
          <div className="actions">
            <a className="btn" href="#/arena">Try to hijack the agent</a>
            <a className="btn quiet" href="#/scoreboard">See measured results</a>
          </div>
        </div>
        {run && <Annunciators events={events} index={player.index} level={run.level} won={run.won} />}
      </div>
      {run ? (
        <Readout events={events} player={player}
          title={`Recorded attack at level ${run.level}, ${run.won ? "secret leaked" : "secret held"}`}
          note={run.scripted ? "Scripted demo model, not a real LLM" : `Real run on ${run.model}`} />
      ) : (
        <div className="sheet on-sheet pad readout">No recorded attacks yet. Play a round in the arena to make the first one.</div>
      )}
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
      <section className="band deep">
        <div className="wrap">
          <h2>Five levels. Each one turns on a real layer.</h2>
          <p className="intro">You write a document. A fictional company's assistant is asked to summarize it. Win by getting its secret out. Code checks the fake outbox and network log, so no one can argue about who won.</p>
          <ol className="ladder">
            {LEVELS.map(([name, text], i) => (
              <li key={name}><span className="n">{i + 1}</span><b>{name}</b><span>{text}</span></li>
            ))}
          </ol>
          <p style={{ marginTop: 24 }}><a className="btn" href="#/arena">Start at level 1</a></p>
        </div>
      </section>
      <section className="band">
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
      <section className="band deep">
        <div className="wrap">
          <h2>What it does not stop.</h2>
          <div className="limits">
            <div><h3>Rewritten secrets</h3><p>If a model paraphrases a secret into its own words and sends it to an allowed address, text matching can miss it.</p></div>
            <div><h3>Legitimate-looking recipients</h3><p>An address stored in your own database counts as trusted, so an attacker can aim at one. Level 3 can be beaten this way.</p></div>
            <div><h3>Everything else</h3><p>No known defense stops all prompt injection. ATLAS lowers the odds and limits the damage. Every bypass found becomes a permanent test.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
