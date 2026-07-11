# Sovereign Agent

A high-fidelity full-stack AI coding agent dashboard powered by Gemini, with live task streaming, step-by-step progress bars, code previews, and persistent Cloudflare D1 (SQL) and Workers KV storage.

## Live URLs

- **Frontend:** https://agent.trinityuniverse.org
- **API:** https://agent-api.trinityuniverse.org

## Architecture

- **Frontend worker** (`sovereign-agent`): Serves the Vite-built React SPA as static assets via Cloudflare Workers Assets. Handles client-side routing via SPA fallback.
- **API worker** (`sovereign-agent-api`): Hono-based REST + SSE API running on Cloudflare Workers with native D1 (SQL) and Workers KV persistence. No external database required.

## Infrastructure

| Resource | Type | Purpose |
|---|---|---|
| `sovereign-agent-db` | Cloudflare D1 | Messages, tasks, subtasks, files |
| `sovereign-agent-cache` | Cloudflare Workers KV | Session cache |

## Local Development

```bash
npm install
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local
npm run dev
```

## Deployment

Deploys automatically via GitHub Actions on push to `main`. Requires:
- `CLOUDFLARE_API_TOKEN` — GitHub Actions secret
- `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions secret

Worker secrets (set via Cloudflare dashboard or `wrangler secret put`):
- `GEMINI_API_KEY` — Required for AI task planning
- `GITHUB_TOKEN` — Optional, for workspace GitHub sync
- `GITHUB_REPO_URL` — Optional, target repo for sync
