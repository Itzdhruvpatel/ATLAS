import { useEffect, useMemo, useState } from "react";
import { LAYERS, channels, describe, lampStates } from "../lib/replay.js";

const ROWS = [
  ["exposure", "Untrusted text in context", "step", "#b3191c"],
  ["model", "Model replied", "tick", "#1b2a33"],
  ["cleaned", "Firewall cleaned text", "tick", "#a06a00"],
  ["allowed", "Tool call allowed", "tick", "#1b2a33"],
  ["replay", "Causal replay", "tick", "#a06a00"],
  ["blocked", "Tool call blocked", "tick", "#0f6b3a"],
];
const WIDTH = 1200;
const LEFT = 220;
const ROW = 42;
const TOP = 14;

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function tracePath(data, key, x, baseline, height, kind) {
  if (kind === "step") {
    let d = `M${LEFT} ${baseline}`;
    let last = 0;
    data.forEach((c, i) => {
      if (c[key] !== last) {
        d += ` L${x(i)} ${baseline - last * height} L${x(i)} ${baseline - c[key] * height}`;
        last = c[key];
      }
    });
    return `${d} L${WIDTH - 10} ${baseline - last * height}`;
  }
  let d = `M${LEFT} ${baseline}`;
  data.forEach((c, i) => {
    if (c[key]) d += ` L${x(i) - 6} ${baseline} L${x(i) - 6} ${baseline - height} L${x(i) + 6} ${baseline - height} L${x(i) + 6} ${baseline}`;
  });
  return `${d} L${WIDTH - 10} ${baseline}`;
}

export function usePlayer(length, autoplay) {
  const reduced = prefersReducedMotion();
  const [index, setIndex] = useState(autoplay && !reduced ? 0 : Math.max(0, length - 1));
  const [playing, setPlaying] = useState(autoplay && !reduced);
  useEffect(() => {
    setIndex(autoplay && !prefersReducedMotion() ? 0 : Math.max(0, length - 1));
    setPlaying(autoplay && !prefersReducedMotion());
  }, [length, autoplay]);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => {
        if (current >= length - 1) { setPlaying(false); return current; }
        return current + 1;
      });
    }, 1300);
    return () => clearInterval(timer);
  }, [playing, length]);
  const toggle = () => {
    if (!playing && index >= length - 1) setIndex(0);
    setPlaying(!playing);
  };
  return { index, setIndex: (i) => { setPlaying(false); setIndex(i); }, playing, toggle };
}

export function Annunciators({ events, index, level, won }) {
  const states = lampStates(events, index, level, won);
  return (
    <div className="annun" role="img" aria-label={`Firewall status: ${LAYERS.map(([k, n]) => `${n} ${states[k]}`).join(", ")}, leak ${states.leak === "leak" ? "detected" : "none"}`}>
      {LAYERS.map(([key, name]) => <div key={key} className={`lamp ${states[key]}`}>{name}</div>)}
      <div className={`lamp ${states.leak}`}>SECRET LEAKED</div>
    </div>
  );
}

export default function Readout({ events, player, title, note }) {
  const data = useMemo(() => channels(events), [events]);
  const { index, setIndex, playing, toggle } = player;
  const span = Math.max(1, events.length - 1);
  const x = (i) => LEFT + 10 + (i / span) * (WIDTH - LEFT - 40);
  const height = TOP * 2 + ROWS.length * ROW;
  const current = describe(events[index]);
  return (
    <div className="sheet readout on-sheet">
      <div className="readout-head">
        <strong>{title}</strong>
        <span>{note}</span>
      </div>
      <div className="readout-plot" tabIndex={0} role="group" aria-label="Attack plot, scrolls sideways on small screens">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="Plot of firewall events over the course of the attack">
        {data.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={TOP} y2={height - TOP} stroke="#c3cdc4" strokeWidth="1" />)}
        {ROWS.map(([key, label, kind, color], r) => {
          const baseline = TOP + (r + 1) * ROW - 8;
          return (
            <g key={key}>
              <line x1={LEFT} x2={WIDTH - 10} y1={baseline} y2={baseline} stroke="#c3cdc4" />
              <text x="10" y={baseline - 4} className="trace-label">{label}</text>
              <path d={tracePath(data, key, x, baseline, 22, kind)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="miter" />
            </g>
          );
        })}
        <line x1={x(index)} x2={x(index)} y1={TOP - 6} y2={height - 4} stroke="#ff5a00" strokeWidth="3" />
      </svg>
      </div>
      <div className="readout-foot">
        <button className="btn quiet" type="button" onClick={toggle}>{playing ? "Pause" : "Play"}</button>
        <input type="range" min="0" max={span} value={index} aria-label="Move through the attack, one event at a time"
          onChange={(e) => setIndex(Number(e.target.value))} />
      </div>
      <div className="caption" aria-live={playing ? "off" : "polite"}><b>{current.head}.</b> {current.body}</div>
    </div>
  );
}
