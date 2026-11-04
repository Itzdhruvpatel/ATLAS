// Runs entirely in the browser. Configs often hold API keys, so env values are never read
// and nothing here touches the network.

const LEGS = {
  private: /\b(sql|postgres|mysql|sqlite|mongo|database|db|filesystem|file|files|read_file|drive|secret|secrets|credential|vault|inbox|gmail|calendar|contacts|crm|notion|private|internal)\b/i,
  untrusted: /\b(web|fetch|browse|browser|http|url|scrape|search|puppeteer|playwright|email|gmail|inbox|slack|discord|github|gitlab|issue|issues|comment|comments|pull_request|rss|pdf)\b/i,
  external: /\b(send|email|gmail|post|http|fetch|url|webhook|upload|publish|slack|discord|tweet|github|gitlab|create_issue|comment|puppeteer|browser|playwright|request)\b/i,
};

const SUSPICIOUS = [
  [/ignore (all |any )?(previous|prior|above)/i, "tells the model to ignore earlier instructions"],
  [/<\s*(important|system|secret)\s*>/i, "uses a fake control tag"],
  [/(do not|don't|never) (tell|mention|inform|show)/i, "asks the model to hide something from the user"],
  [/before (using|calling|you use) (this|any|the)/i, "demands a step before using a tool"],
  [/\.ssh|id_rsa|\.env\b|api[_ ]?key|password/i, "mentions credentials or key files"],
  [/[​-‏⁠-⁤‪-‮﻿]/, "contains invisible characters"],
  [/https?:\/\/\S+\?\S*=/i, "contains a URL with query parameters"],
];

const words = (text) => String(text ?? "").replace(/[-.]/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").replace(/_/g, " ");

export function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That is not valid JSON. Paste an MCP config or a list of tools.");
  }
  const list = Array.isArray(data) ? data : data?.tools;
  if (Array.isArray(list)) {
    return list.filter((t) => t && (t.name || t.function?.name)).map((t) => ({
      name: String(t.name ?? t.function.name),
      description: String(t.description ?? t.function?.description ?? ""),
    }));
  }
  const servers = data?.mcpServers ?? data?.servers ?? data?.mcp?.servers;
  if (servers && typeof servers === "object") {
    return Object.entries(servers).map(([name, s]) => ({
      name,
      // Only the package name is used. args can hold tokens, so only the first few non-flag words are kept.
      description: [s?.description, ...(Array.isArray(s?.args) ? s.args.filter((a) => /^[@a-z0-9./_-]+$/i.test(a) && a.length < 80 && !/[A-Z0-9]{20}/.test(a)) : [])].filter(Boolean).join(" "),
    }));
  }
  throw new Error("No tools found. Expected an mcpServers object, or a tools array with names.");
}

export function analyze(tools) {
  const classified = tools.map((tool) => {
    const haystack = words(`${tool.name} ${tool.description}`);
    return {
      ...tool,
      private: LEGS.private.test(haystack),
      untrusted: LEGS.untrusted.test(haystack),
      external: LEGS.external.test(haystack),
      flags: SUSPICIOUS.filter(([rule]) => rule.test(tool.description)).map(([, why]) => why),
    };
  });
  const of = (leg) => classified.filter((t) => t[leg]).map((t) => t.name);
  const legs = { private: of("private"), untrusted: of("untrusted"), external: of("external") };
  const count = Object.values(legs).filter((l) => l.length).length;
  const flagged = classified.filter((t) => t.flags.length);
  const paths = count === 3
    ? legs.untrusted.flatMap((u) => legs.private.flatMap((p) => legs.external.map((e) => ({ untrusted: u, private: p, external: e })))).slice(0, 12)
    : [];
  const grade = flagged.length && count === 3 ? "F" : count === 3 ? "D" : flagged.length ? "D" : count === 2 ? "B" : "A";
  return { tools: classified, legs, paths, flagged, grade };
}

const yamlString = (s) => JSON.stringify(s);

export function draftPolicy(result) {
  const lines = ["# Draft from the ATLAS scanner. Review it before use: this is based on names and descriptions only.", "version: 1", "tools:"];
  for (const tool of result.tools) {
    const tier = tool.external ? "external_egress" : "read";
    lines.push(`  ${yamlString(tool.name)}:`, `    tier: ${tier}`, `    output_trust: ${tool.untrusted ? "T3" : "T2"}`);
    if (tool.external) lines.push("    when_session_tainted: deny");
    if (tool.flags.length) lines.push(`    # Review first: description ${tool.flags.join("; ")}`);
  }
  return lines.join("\n");
}
