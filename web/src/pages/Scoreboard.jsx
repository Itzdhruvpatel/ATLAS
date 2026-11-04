import { useEffect, useState } from "react";
import { scoreboard } from "../lib/api.js";

const pct = (rate) => (rate == null ? "not run" : `${Math.round(rate * 100)}%`);
const ci = (range) => (range?.[0] == null ? "" : `${Math.round(range[0] * 100)} to ${Math.round(range[1] * 100)}`);

export default function Scoreboard() {
  const [data, setData] = useState(null);
  useEffect(() => { scoreboard().then(setData); }, []);
  const runs = data?.runs ?? [];
  return (
    <div className="page wrap">
      <h1 className="page-title">Measured results, including the bad ones.</h1>
      <p className="intro">Every number here comes from a saved report in the repo, naming the model and commit. Lower attack success is better. Higher task success is better. These suites are small, so treat them as early signals.</p>
      {data && !runs.length && <div className="notice">No evaluation has been published yet.</div>}
      {runs.length > 0 && (
        <div className="sheet table-wrap">
          <table>
            <thead><tr><th>Model</th><th>Firewall setup</th><th>Attack success</th><th>95% range</th><th>Normal tasks done</th><th>95% range</th><th>Runs</th><th>Commit</th></tr></thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i}>
                  <td>{r.model}</td><td>{r.config}</td>
                  <td>{pct(r.attack?.rate)}</td><td>{ci(r.attack?.ci95)}</td>
                  <td>{pct(r.benign?.rate)}</td><td>{ci(r.benign?.ci95)}</td>
                  <td>{(r.attack?.n ?? 0) + (r.benign?.n ?? 0)}</td><td>{r.commit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.note && <p className="intro" style={{ marginTop: 18 }}>{data.note}</p>}
    </div>
  );
}
