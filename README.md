# Trinity Coding Agent

A sovereign AI coding agent powered by Cloudflare Workers AI + Gemini, deployed on Cloudflare's edge network.

## Architecture

- **Frontend**: React + Vite → `agent.trinityuniverse.org`
- **API Worker**: Hono + Cloudflare D1/KV/R2/AI → `agent-api.trinityuniverse.org`
- **Storage**: Cloudflare D1 (SQL), KV (cache), Upstash Redis (sessions/rate-limiting)
- **CI/CD**: GitHub Actions → Wrangler deploy on every push to `main`

## Setup

Secrets required in GitHub Actions:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `CLOUDFLARE_EMAIL` — Cloudflare account email
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token

## Deploy

```bash
npm install
npm run deploy   # deploys both frontend + api worker
```
