# Claude proxy for "Ask the Planner"

Without this, the chat uses built-in answers, and anyone can add their own Anthropic API key in
the chat's ⚙ Settings. With it, everyone who opens the planner gets Claude answers with no key,
billed to the maintainer's Anthropic account.

## Deploy (about 5 minutes, free Cloudflare account)

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste your key when prompted
# edit wrangler.toml: set ALLOWED_ORIGINS to your GitHub Pages origin
npx wrangler deploy
```

Wrangler prints a URL like `https://emba-planner-proxy.<you>.workers.dev`. Put it in
`data/program.js`:

```js
assistant: { endpoint: "https://emba-planner-proxy.<you>.workers.dev", model: "claude-opus-5-5" }
```

## Cost and safety

- Each question sends the full planner (about 17K tokens) as a cached system prompt: roughly 8 cents
  for the first question, then about a penny each for follow-ups within a few minutes (cache reads plus the answer).
- Uses Claude Opus 5.5 at low effort. Change `MODEL` in `wrangler.toml` to use a different model.
- Only your Pages origin can call it, the model and `max_tokens` are forced, and tools are
  stripped. An origin check doesn't stop a determined person from calling it from a script,
  so set a monthly spend limit in the Anthropic Console (Settings → Limits).
