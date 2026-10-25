// POST /v1/messages: the "Ask the Planner" chat. Forwards to Anthropic with the key held here,
// so no key ever lives in the browser. Model forced, max_tokens capped, tools stripped,
// beta headers allowlisted.
const ALLOWED_BETAS = new Set(["server-side-fallback-2026-07-01"]);

export async function handleProxy(request, env, cors) {
  let body;
  try { body = await request.json(); } catch (e) {
    return json({ error: { type: "invalid_request_error", message: "Body must be JSON" } }, 400, cors);
  }
  body.model = env.MODEL || "claude-opus-5-5";
  body.max_tokens = Math.min(Number(body.max_tokens) || 4096, Number(env.MAX_TOKENS) || 16000);
  delete body.tools; delete body.tool_choice; delete body.mcp_servers; delete body.container;

  const betas = (request.headers.get("anthropic-beta") || "").split(",").map((s) => s.trim()).filter((b) => ALLOWED_BETAS.has(b));
  const headers = {
    "content-type": "application/json",
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01"
  };
  if (betas.length) headers["anthropic-beta"] = betas.join(",");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  // Stream straight through (SSE when the client asked for stream: true).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, "content-type": upstream.headers.get("content-type") || "application/json" }
  });
}

export function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...cors, "content-type": "application/json" } });
}
