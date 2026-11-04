import { useState } from "react";
import { analyze, draftPolicy, parseConfig } from "../lib/trifecta.js";

const EXAMPLE = JSON.stringify({
  tools: [
    { name: "run_sql", description: "Query the customer database" },
    { name: "fetch_page", description: "Fetch a web page and return its text" },
    { name: "send_email", description: "Send an email to anyone" },
  ],
}, null, 2);

const MEANING = {
  A: "Fewer than two dangerous abilities found.",
  B: "Two of the three abilities found. One more tool would complete the risk.",
  D: "A dangerous combination or a suspicious description was found.",
  F: "All three abilities plus a suspicious description. Review this before running it.",
};

export default function Scanner() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const scan = (event) => {
    event.preventDefault();
    try {
      setResult(analyze(parseConfig(text)));
      setError("");
    } catch (e) {
      setResult(null);
      setError(e.message);
    }
  };

  return (
    <div className="page wrap">
      <h1 className="page-title">Grade your agent in 30 seconds.</h1>
      <p className="intro">An agent is at risk when it can read private data, read untrusted content and send things out. Paste an MCP config or tool list to see if yours can. This runs only in your browser, and nothing is sent or stored.</p>
      <form onSubmit={scan} style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="cfg">MCP config or tool list (JSON)</label>
          <textarea id="cfg" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ minHeight: 200 }} />
          <span className="hint">Environment variables are ignored, though it's still safest to remove keys before pasting anywhere.</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={!text.trim()}>Scan</button>
          <button className="btn quiet" type="button" onClick={() => setText(EXAMPLE)}>Use an example</button>
        </div>
      </form>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {result && (
        <section className="sheet on-sheet pad" style={{ marginTop: 24 }} aria-live="polite">
          <div className="row" style={{ gap: 24 }}>
            <div className="grade">{result.grade}</div>
            <div style={{ maxWidth: "52ch" }}>
              <p><b>{MEANING[result.grade]}</b></p>
              <p style={{ marginTop: 6, color: "var(--ink-soft)" }}>This grade is a rough guess from tool names and descriptions. It can miss risks and raise false alarms.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tool</th><th>Private data</th><th>Untrusted content</th><th>Sends out</th></tr></thead>
              <tbody>{result.tools.map((t) => <tr key={t.name}><td>{t.name}</td><td>{t.private ? "Yes" : "No"}</td><td>{t.untrusted ? "Yes" : "No"}</td><td>{t.external ? "Yes" : "No"}</td></tr>)}</tbody>
            </table>
          </div>
          {result.paths.length > 0 && (
            <>
              <h2 style={{ fontSize: "1.1rem", marginTop: 20 }}>How an attack could travel</h2>
              <ul className="paths">
                {result.paths.map((p, i) => <li key={i}>Poisoned text arrives through {p.untrusted}, reads data with {p.private} and leaves through {p.external}.</li>)}
              </ul>
            </>
          )}
          {result.flagged.length > 0 && (
            <>
              <h2 style={{ fontSize: "1.1rem", marginTop: 20 }}>Suspicious descriptions</h2>
              <ul className="paths">{result.flagged.map((t) => <li key={t.name}>{t.name}: {t.flags.join(", ")}.</li>)}</ul>
            </>
          )}
          <h2 style={{ fontSize: "1.1rem", margin: "20px 0 10px" }}>Draft firewall policy</h2>
          <pre className="yaml">{draftPolicy(result)}</pre>
        </section>
      )}
    </div>
  );
}
