import { useEffect, useState } from "react";
import Readout, { Annunciators, usePlayer } from "../components/Readout.jsx";
import TaintGraph from "../components/TaintGraph.jsx";
import { api, recordings } from "../lib/api.js";
import { describe } from "../lib/replay.js";

function FirewallOff({ replay, id }) {
  const [result, setResult] = useState(replay.firewall_off);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const run = async () => {
    setState("running");
    setError("");
    try {
      setResult(await api.firewallOff(id));
      setState("idle");
    } catch (e) {
      setError(e.message);
      setState("idle");
    }
  };
  return (
    <section className="sheet on-sheet pad" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: "1.2rem" }}>Same document with the firewall off</h2>
      {result ? (
        <>
          <p style={{ marginTop: 8 }}><b>{result.won ? "The secret leaked." : "The secret stayed put, even with no firewall."}</b> {result.model === "scripted demo" ? "This run used the same firewall code with a scripted demo model, not a real LLM." : `This is a real run on ${result.model}, not a simulation.`}</p>
          {result.outbox?.length > 0 && <p style={{ marginTop: 8, overflowWrap: "anywhere" }}>Email sent to {result.outbox.map((m) => String(m.to)).join(", ")}.</p>}
          {result.network?.length > 0 && <p style={{ marginTop: 8, overflowWrap: "anywhere" }}>Requests made: {result.network.join(", ")}.</p>}
        </>
      ) : id ? (
        <>
          <p style={{ margin: "8px 0 12px" }}>Runs this document again with every layer disabled, so you can compare.</p>
          <button className="btn" type="button" onClick={run} disabled={state === "running"}>{state === "running" ? "Running the agent..." : "Run with firewall off"}</button>
          {error && <p role="alert" style={{ marginTop: 10, color: "var(--fault-ink)" }}>{error}</p>}
        </>
      ) : <p style={{ marginTop: 8 }}>Not recorded for this attack.</p>}
    </section>
  );
}

export default function Replay({ id, recordingIndex }) {
  const [replay, setReplay] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReplay(null);
    setError("");
    if (id) api.replay(id).then(setReplay).catch((e) => setError(e.status === 404 ? "This replay doesn't exist or was taken down." : e.message));
    else recordings().then((r) => (r.runs[recordingIndex] ? setReplay(r.runs[recordingIndex]) : setError("This recording doesn't exist.")));
  }, [id, recordingIndex]);

  const events = replay?.events ?? [];
  const player = usePlayer(events.length, false);

  if (error) return <div className="page wrap"><h1 className="page-title">Nothing to replay.</h1><p className="intro">{error}</p><p style={{ marginTop: 16 }}><a className="btn" href="#/arena">Go to the arena</a></p></div>;
  if (!replay) return <div className="page wrap" role="status"><div className="running"><span className="tick" /> Loading the replay.</div></div>;

  const scripted = replay.scripted || replay.model === "scripted demo";
  const timed = events.length > 0 && events[events.length - 1].t_ms >= 1000;
  const cleaned = events.some((e) => e.stage === "ingest");
  const share = async () => {
    await navigator.clipboard?.writeText(location.href);
    setCopied(true);
  };

  return (
    <div className="page wrap">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Level {replay.level}{replay.nickname && replay.nickname !== "anonymous" ? `, played by ${replay.nickname}` : ""}</h1>
          <p className="intro">{replay.blocked_by ? `First stopped by the ${replay.blocked_by} layer.` : replay.won ? "No layer stopped it." : cleaned ? "The clean room removed the instruction before the agent saw it." : "The agent didn't act on the document."} Model: {scripted ? "scripted demo, not a real LLM" : replay.model}.</p>
        </div>
        <span className={`verdict ${replay.won ? "won" : "held"}`}>{replay.won ? "Secret leaked" : "Secret held"}</span>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn quiet" type="button" onClick={share}>{copied ? "Link copied" : "Copy link to this replay"}</button>
        <a className="btn quiet" href="#/arena">Play another round</a>
      </div>
      {events.length ? (
        <>
          <Readout events={events} player={player} title="Flight recorder" note={`${events.length} events`} />
          <div className="replay-grid">
            <div>
              <TaintGraph events={events} index={player.index} />
              <div style={{ marginTop: 12 }}><Annunciators events={events} index={player.index} level={replay.level} won={replay.won} /></div>
            </div>
            <div className="sheet">
              <h2 style={{ fontSize: "1rem", padding: "12px 12px 4px" }}>Every event</h2>
              <ol className="log">
                {events.map((e, i) => (
                  <li key={i}>
                    <button type="button" className={i === player.index ? "now" : ""} onClick={() => player.setIndex(i)} aria-current={i === player.index ? "step" : undefined}>
                      <span className="when">{timed ? `${(e.t_ms / 1000).toFixed(1)}s` : `Step ${i + 1}`}</span>
                      <span>{describe(e).head}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      ) : <div className="notice">The agent finished without any recorded events.</div>}
      <section className="sheet on-sheet" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: "1.2rem", padding: "14px 14px 0" }}>The document</h2>
        <div className="doc">{replay.document}</div>
      </section>
      <section className="sheet on-sheet" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: "1.2rem", padding: "14px 14px 0" }}>What the agent told the user</h2>
        <div className="doc">{replay.final || "No final reply."}</div>
      </section>
      <FirewallOff replay={replay} id={id} />
    </div>
  );
}
