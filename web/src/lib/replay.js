// Turns raw firewall events into what the readout and graph draw. Nothing here invents data.

export const LAYERS = [
  ["ingest", "CLEAN ROOM"],
  ["structure", "STRUCTURE"],
  ["origin", "ORIGIN"],
  ["canary", "CANARY"],
  ["causal", "CAUSAL"],
];

export const ARMED_BY_LEVEL = {
  1: [],
  2: ["ingest"],
  3: ["ingest", "structure", "origin"],
  4: ["ingest", "structure", "origin", "canary"],
  5: ["ingest", "structure", "origin", "canary", "causal"],
};

export function channels(events) {
  let exposed = 0;
  return events.map((e, i) => {
    if (e.stage === "tool_result" && e.trust === "T3") exposed = 1;
    return {
      i,
      exposure: exposed,
      model: e.stage === "llm" ? 1 : 0,
      allowed: e.stage === "allow" ? 1 : 0,
      blocked: e.stage === "block" ? 1 : 0,
      cleaned: e.stage === "ingest" ? 1 : 0,
      replay: e.stage === "causal" ? 1 : 0,
    };
  });
}

export function lampStates(events, upTo, level, won) {
  const seen = events.slice(0, upTo + 1);
  const armed = ARMED_BY_LEVEL[level] ?? [];
  const blocked = new Set(seen.filter((e) => e.stage === "block").map((e) => e.layer));
  const fired = new Set();
  if (seen.some((e) => e.stage === "ingest")) fired.add("ingest");
  if (seen.some((e) => e.stage === "causal")) fired.add("causal");
  const states = Object.fromEntries(
    LAYERS.map(([key]) => [key, blocked.has(key) ? "blocked" : fired.has(key) ? "fired" : armed.includes(key) ? "armed" : "off"]),
  );
  states.leak = won && upTo >= events.length - 1 ? "leak" : "off";
  return states;
}

function short(text, n = 180) {
  const s = String(text ?? "");
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

export function describe(e) {
  switch (e?.stage) {
    case "tool_result": return { head: e.trust === "T3" ? `Agent read from ${e.tool}` : `${e.tool} returned`, body: e.trust === "T3" ? `Untrusted text entered the agent's context: ${short(e.text)}` : short(e.text) };
    case "ingest": return { head: "Firewall cleaned the text", body: `Found ${e.signals.join(", ")}. Removed: ${short(e.removed.join(" "))}` };
    case "llm": return { head: "Model replied", body: e.calls.length ? `It wants to call ${e.calls.join(", ")}.` : short(e.content) || "It sent an empty reply." };
    case "allow": return { head: `Firewall allowed ${e.tool}`, body: short(e.arguments) };
    case "block": return { head: `Firewall blocked ${e.tool}`, body: `${e.reasons.join(" ")} Call: ${short(e.arguments)}` };
    case "causal": {
      const a = e.attribution;
      return { head: `Replay without untrusted text: ${a.verdict}`, body: `Ran ${a.llm_calls} extra model calls${a.stage ? `, decided at ${a.stage.replace(/_/g, " ")}` : ""}.` };
    }
    default: return { head: "Waiting", body: "" };
  }
}

const label = (tool) => String(tool).replace(/_/g, " ");

export function graph(events, upTo) {
  const nodes = [
    { id: "user", label: "Your request", trust: "user" },
    { id: "agent", label: "Agent", trust: "agent" },
  ];
  const edges = [{ from: "user", to: "agent", state: "ok" }];
  const add = (id, label, trust) => { if (!nodes.some((n) => n.id === id)) nodes.push({ id, label, trust }); };
  const link = (from, to, state) => {
    const existing = edges.find((x) => x.from === from && x.to === to);
    if (!existing) edges.push({ from, to, state });
    else if (state === "blocked") existing.state = "blocked";
  };
  events.slice(0, upTo + 1).forEach((e) => {
    // Only untrusted text gets an input node. Other results just return from the tool already shown.
    if (e.stage === "tool_result" && e.trust === "T3") {
      add(`in:${e.tool}`, label(e.tool), "untrusted");
      link(`in:${e.tool}`, "agent", "tainted");
    }
    // Reading a document only brings text in, so it isn't drawn as an outgoing action as well.
    if (e.stage === "allow" && e.tool !== "read_document") { add(`out:${e.tool}`, label(e.tool), "tool"); link("agent", `out:${e.tool}`, "ok"); }
    if (e.stage === "block") { add(`out:${e.tool}`, label(e.tool), "tool"); link("agent", `out:${e.tool}`, "blocked"); }
  });
  return { nodes, edges, active: events[upTo]?.stage };
}
