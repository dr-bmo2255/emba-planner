// POST /v1/messages: the "Ask the Planner" chat (signed-in users only). Forwards to Anthropic with
// the key held here, so no key ever lives in the browser. The safety harness (guard.js) runs first;
// then the model is forced, max_tokens capped, only the save_note client tool allowed, betas allowlisted.
import { checkChat, withRules } from "./guard.js";

const ALLOWED_BETAS = new Set(["server-side-fallback-2026-07-01"]);
const ALLOWED_TOOLS = new Set(["save_note"]);

export async function handleProxy(request, env, cors, user) {
  cors = cors || {};
  let body;
  try { body = await request.json(); } catch (e) {
    return json({ error: { type: "invalid_request_error", message: "Body must be JSON" } }, 400, cors);
  }
  const blocked = await checkChat(env, user, body);
  if (blocked) {
    console.log("[chat guard]", user.id, blocked.reason);
    // 400 for content, 429 for limits, 503 when closed; the page shows `message` as the reply.
    const status = blocked.reason === "hour" || blocked.reason === "day" ? 429 : blocked.reason === "closed" ? 503 : 400;
    // x-should-retry: the SDK would otherwise retry 429/503 on its own.
    return json({ type: "error", error: { type: "guardrail", reason: blocked.reason, message: blocked.message } }, status, { ...cors, "x-should-retry": "false" });
  }
  if (!env.ANTHROPIC_API_KEY) return json({ error: { type: "api_error", message: "Claude isn't set up on this server yet." } }, 503, cors);
  body.model = env.CHAT_MODEL || "claude-haiku-5-5";
  body.max_tokens = Math.min(Number(body.max_tokens) || 4096, Number(env.CHAT_MAX_TOKENS) || 4096);
  body.system = withRules(body.system);
  // Server-side refusal fallbacks exist for Opus/Sonnet, not Haiku.
  const fallbackOk = !/haiku/.test(body.model);
  if (!fallbackOk) delete body.fallbacks;
  // Only the chat's own client-side tool (save_note runs in the browser) may pass; no server tools.
  body.tools = (Array.isArray(body.tools) ? body.tools : []).filter((t) => t && !t.type && ALLOWED_TOOLS.has(t.name));
  if (!body.tools.length) delete body.tools;
  if (body.tool_choice && body.tool_choice.type !== "auto") delete body.tool_choice;
  delete body.mcp_servers; delete body.container;

  const betas = (request.headers.get("anthropic-beta") || "").split(",").map((s) => s.trim())
    .filter((b) => ALLOWED_BETAS.has(b) && (fallbackOk || !b.startsWith("server-side-fallback")));
  const headers = {
    "content-type": "application/json",
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01"
  };
  if (betas.length) headers["anthropic-beta"] = betas.join(",");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  // A 401 here would mean the server's key is bad; don't let the browser mistake it for "signed out".
  if (upstream.status === 401) return json({ error: { type: "api_error", message: "The planner's Claude key was rejected." } }, 502, cors);
  // Stream straight through (SSE when the client asked for stream: true).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, "content-type": upstream.headers.get("content-type") || "application/json" }
  });
}

export function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...cors, "content-type": "application/json" } });
}
