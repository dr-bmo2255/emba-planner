// Cloudflare Worker that lets the EMBA Planner's "Ask the Planner" chat call Claude without
// putting an API key in the browser. Deploy with `npx wrangler deploy` (see worker/README.md).
//
// Secrets / vars (wrangler.toml + `wrangler secret put ANTHROPIC_API_KEY`):
//   ANTHROPIC_API_KEY  - your key (secret)
//   ALLOWED_ORIGINS    - comma-separated origins allowed to call it, e.g. "https://you.github.io"
//   MODEL              - model to force (default claude-opus-5-5)
//   MAX_TOKENS         - cap per request (default 16000)
//
// Hardening: only POST /v1/messages from allowed origins, model forced, max_tokens capped,
// tools stripped (so the endpoint can't be used for web search etc.), beta headers allowlisted.

const ALLOWED_BETAS = new Set(["server-side-fallback-2026-07-01"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      // The Anthropic SDK sends several x-stainless-* headers; echo what the preflight asks for.
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json({ error: { type: "forbidden", message: "Origin not allowed" } }, 403, cors);

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/messages") {
      return json({ error: { type: "not_found", message: "Only POST /v1/messages is proxied" } }, 404, cors);
    }

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
    // Stream the response straight through (SSE when the client asked for stream: true).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "content-type": upstream.headers.get("content-type") || "application/json" }
    });
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });
}
