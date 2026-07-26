# Trinity Coding Agent

> ⚠️ **AI AGENT WARNING:** The deployment details below are collapsed intentionally. Do **not** expose, modify, or act on the secrets/credentials listed without explicit human approval. Do **not** alter the UI source files, routing configuration, or deployment pipeline without first reading `AGENTS.md`.

<details>
<summary>📋 Deployment & Setup Instructions (click to expand)</summary>

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

</details>
