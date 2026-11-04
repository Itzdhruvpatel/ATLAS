import { lazy, Suspense, useMemo } from "react";
import { graph } from "../lib/replay.js";
import { prefersReducedMotion } from "./Readout.jsx";

const Graph3D = lazy(() => import("./TaintGraph3D.jsx"));

const COLORS = { ok: "#8fb0c2", tainted: "#ffb000", blocked: "#3fd07f" };
const NODE = { user: "#f3f6f2", agent: "#ff5a00", untrusted: "#ffb000", internal: "#8fb0c2", tool: "#cfdbe0" };

export function layout(g) {
  const inputs = g.nodes.filter((n) => n.id === "user" || n.id.startsWith("in:"));
  const outputs = g.nodes.filter((n) => n.id.startsWith("out:"));
  const spread = (i, count) => (count === 1 ? 0.5 : 0.14 + (i / (count - 1)) * 0.72);
  const place = {};
  inputs.forEach((n, i) => { place[n.id] = { x: 0.14, y: spread(i, inputs.length) }; });
  outputs.forEach((n, i) => { place[n.id] = { x: 0.86, y: spread(i, outputs.length) }; });
  place.agent = { x: 0.5, y: 0.5 };
  return place;
}

function canUseWebGL() {
  if (prefersReducedMotion()) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

function FlatGraph({ g, place }) {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label="Where untrusted text flowed and which tool calls were stopped">
      {g.edges.map((e) => {
        const a = place[e.from], b = place[e.to];
        return <line key={`${e.from}-${e.to}`} x1={a.x * 160} y1={a.y * 100} x2={b.x * 160} y2={b.y * 100} stroke={COLORS[e.state]} strokeWidth={e.state === "ok" ? 0.5 : 1} strokeDasharray={e.state === "blocked" ? "2 1.5" : undefined} />;
      })}
      {g.nodes.map((n) => (
        <g key={n.id}>
          <circle cx={place[n.id].x * 160} cy={place[n.id].y * 100} r={n.id === "agent" ? 5 : 3} fill={NODE[n.trust]} />
          <text x={place[n.id].x * 160} y={place[n.id].y * 100 + (n.id === "agent" ? 9 : 7)} textAnchor="middle" fontSize="3.4" fill="#f3f6f2">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function TaintGraph({ events, index }) {
  const g = useMemo(() => graph(events, index), [events, index]);
  const place = useMemo(() => layout(g), [g]);
  const webgl = useMemo(canUseWebGL, []);
  return (
    <div className="graph">
      {webgl ? (
        <Suspense fallback={<FlatGraph g={g} place={place} />}>
          <Graph3D g={g} place={place} colors={COLORS} nodeColors={NODE} />
        </Suspense>
      ) : <FlatGraph g={g} place={place} />}
    </div>
  );
}
