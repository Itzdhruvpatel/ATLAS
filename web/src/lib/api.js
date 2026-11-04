// Empty when the same server hosts the site and the arena.
const API_URL = import.meta.env.VITE_API_URL ?? "";

async function request(path, options) {
  let response;
  try {
    response = await fetch(API_URL + path, options);
  } catch {
    throw Object.assign(new Error("The arena server cannot be reached. Check your connection and try again."), { code: "offline" });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body.detail === "string" ? body.detail : "error";
    const messages = {
      budget: "Today's model budget is used up. Recorded attacks are below, and the arena reopens tomorrow.",
      rate: "You've played a lot this hour. Wait a while, then try again.",
    };
    throw Object.assign(new Error(messages[code] ?? (typeof body.detail === "string" ? body.detail : "That request failed. Check your input and try again.")), { code, status: response.status });
  }
  return body;
}

const post = (path, body) => request(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});

export const api = {
  status: () => request("/api/status"),
  play: (body) => post("/api/rounds", body),
  replay: (id) => request(`/api/replays/${encodeURIComponent(id)}`),
  firewallOff: (id) => post(`/api/replays/${encodeURIComponent(id)}/firewall-off`),
  leaderboard: () => request("/api/leaderboard"),
};

export const recordings = () => fetch("/recordings.json").then((r) => (r.ok ? r.json() : { runs: [] })).catch(() => ({ runs: [] }));
export const scoreboard = () => fetch("/scoreboard.json").then((r) => (r.ok ? r.json() : { runs: [] })).catch(() => ({ runs: [] }));
