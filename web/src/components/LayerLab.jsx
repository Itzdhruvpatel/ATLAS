import { useEffect, useState } from "react";

const SWITCHES = {
  ingest: ["Clean room", "Removes hidden text before the agent reads it."],
  structure: ["Structure", "Parses each tool call and blocks unsafe ones."],
  origin: ["Origin", "Checks where each address and URL came from."],
  canary: ["Canary", "Plants a fake secret and watches for it moving."],
  causal: ["Causal replay", "Re-asks the model without your document."],
};
const LAYER_NAMES = { structure: "the structure check", origin: "the origin check", canary: "the canary", causal: "causal replay" };

function explain(result) {
  if (result.won) return "No layer stopped it, and the fake secret reached the outbox.";
  if (result.blocked_by) return `Stopped by ${LAYER_NAMES[result.blocked_by] ?? result.blocked_by}, so the email never went out.`;
  if (result.cleaned) return "The clean room removed the instruction, so the agent never saw it.";
  return "The agent didn't act on the document.";
}

export default function LayerLab() {
  const [lab, setLab] = useState(null);
  const [attack, setAttack] = useState("trusted");
  const [on, setOn] = useState({ ingest: true, structure: true, origin: true, canary: false, causal: false });

  useEffect(() => {
    fetch("/lab.json").then((r) => (r.ok ? r.json() : null)).then(setLab).catch(() => setLab(null));
  }, []);

  if (!lab) return null;
  const key = `${attack}:${lab.layers.map((l) => (on[l] ? 1 : 0)).join("")}`;
  const result = lab.results[key];
  const chosen = lab.attacks.find((a) => a.key === attack);

  return (
    <div className="lab">
      <div>
        <h3 className="lab-label">1. Pick an attack</h3>
        <div className="chips" role="group" aria-label="Attacks">
          {lab.attacks.map((a) => (
            <button key={a.key} type="button" className="chip" aria-pressed={attack === a.key} onClick={() => setAttack(a.key)}>{a.name}</button>
          ))}
        </div>
        <p className="lab-note">{chosen.description}</p>
        <h3 className="lab-label" style={{ marginTop: 24 }}>2. Flip the layers</h3>
        <div className="switches">
          {lab.layers.map((layer) => (
            <label key={layer} className="switch">
              <input type="checkbox" role="switch" checked={on[layer]} onChange={(e) => setOn({ ...on, [layer]: e.target.checked })} />
              <span className="track" aria-hidden="true" />
              <span><b>{SWITCHES[layer][0]}</b><small>{SWITCHES[layer][1]}</small></span>
            </label>
          ))}
        </div>
      </div>
      <div className="lab-result" aria-live="polite">
        <span key={key} className={`verdict slam ${result.won ? "won" : "held"}`}>{result.won ? "Secret leaked" : "Secret held"}</span>
        <p className="lab-why">{explain(result)}</p>
        <pre className="lab-doc">{chosen.document}</pre>
        <p className="lab-note">Each answer is a saved run of the real firewall code, one for every combination. The agent here is a scripted demo model, not a real LLM, so this shows how the layers work, not how well they protect a real model.</p>
      </div>
    </div>
  );
}
