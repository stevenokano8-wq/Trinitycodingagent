# 🧠 Trinity Coding Agent — Incoming Agent Brief

> **Read this entire file before touching any code.** It explains the architecture, the known failure modes, and the rules that protect the sovereign UI from accidental rewrites.

---

## 1. What This Project Is

**Trinity Coding Agent** is a full-stack, self-hosted AI coding assistant that runs on **Cloudflare Workers + Durable Objects**, with a **React/Vite** frontend. It lets users type a natural-language prompt; the agent plans tasks, generates code, runs real terminal commands inside an isolated sandbox, and pushes results to GitHub — all visible live in the browser via Server-Sent Events (SSE).

- **Frontend** → `agent.trinityuniverse.org` (Cloudflare Pages / static assets via `wrangler.toml`)
- **API Worker** → `agent-api.trinityuniverse.org` (Cloudflare Worker via `wrangler.api.toml` → `server/worker.ts`)
- **Dev server** → `server.ts` (Express, runs via `tsx server.ts`, port 3000 for local)

---

## 2. Directory Map

```
/
├── src/                    ← React/Vite frontend source (do NOT auto-rewrite)
│   ├── App.tsx             ← Root shell (nav, sidebar, tab switcher)
│   ├── main.tsx            ← React mount point
│   ├── index.css           ← Tailwind v3 + custom animations
│   ├── types.ts            ← Shared TypeScript types (Task, Subtask, Message, FileNode)
│   ├── lib/api.ts          ← API_BASE URL (empty string in dev, CF domain in prod)
│   └── components/         ← All view components (see §3 below)
│
├── server/                 ← Node-compatible Worker source
│   ├── worker.ts           ← Hono app, all /api/* routes, DO exports ← ENTRY POINT
│   ├── agent.ts            ← AI planner + executor (planBuildTasks, executeAgentBuild)
│   ├── db.ts               ← D1 + local JSON fallback (agent-workspace/.db_store.json)
│   ├── command.ts          ← Shell command executor + safety guardrails
│   ├── terminal.ts         ← Thin wrapper + ANSI stripper
│   ├── github.ts           ← GitHub REST API push/PR via fetch (no git binary)
│   ├── llmRouter.ts        ← Multi-provider LLM fallback chain
│   ├── env.ts              ← All Cloudflare binding type definitions
│   ├── logger.ts           ← Log-drop store (in-memory, SSE-broadcast)
│   ├── cache.ts            ← KV cache helpers
│   ├── redis.ts            ← Upstash Redis adapter (optional)
│   └── durable-objects/    ← Each DO class (SessionWorkspace, FileExplorer, etc.)
│
├── agent-workspace/        ← ALL agent-generated files live HERE (never in src/)
│   ├── .db_store.json      ← Local fallback DB (tasks, messages, files)
│   └── envs/               ← Per-session environment scratch space
│
├── wrangler.toml           ← Frontend worker config (serves dist/ as static assets)
├── wrangler.api.toml       ← API worker config (main = server/worker.ts) ← KEY
├── wrangler.frontend.toml  ← Alias for frontend worker (same as wrangler.toml)
├── vite.config.ts          ← Vite config (port 3000, host: true)
├── server.ts               ← Express dev server (wraps Hono worker in Node)
├── tsconfig.json           ← Frontend TS config
├── tsconfig.server.json    ← Server TS config (target: ESNext, module: NodeNext)
├── .github/workflows/
│   └── deploy.yml          ← CI/CD (push to main → type-check → vite build → wrangler deploy)
└── AGENTS.md               ← UI protection notice (read before modifying any component)
```

---

## 3. Component Map (src/components/)

| File | Purpose | Locked? |
|---|---|---|
| `TaskAccordion.tsx` | Renders Task + Subtask accordion panels with live logs | ⚠️ Core — patch carefully |
| `Sidebar.tsx` | Left nav panel with tab switcher + session list | ✅ Protected |
| `Navbar.tsx` | Top bar, persona switcher, action buttons | ✅ Protected |
| `ExecutionTimeline.tsx` | Chat + SSE event feed, main left panel | ✅ Protected |
| `CodeView.tsx` | Virtual file explorer with syntax highlighting | ✅ Protected |
| `DeployView.tsx` | Cloudflare deploy + wrangler status | ✅ Protected |
| `GithubView.tsx` | GitHub push / PR creation UI | ✅ Protected |
| `DbVisualizer.tsx` | D1 / local DB viewer | ✅ Protected |
| `LogsView.tsx` | Real-time SSE log stream | ✅ Protected |
| `EnvBoxView.tsx` | .env variable display + edit | ✅ Protected |
| `PreviewView.tsx` | Embedded live preview iframe | ✅ Protected |
| `SettingsView.tsx` | Settings panel | ✅ Protected |
| `WorkspacePreview.tsx` | Workspace file preview | ✅ Protected |

**Rule:** Add new features as new component files. Never modify the locked components without explicit user approval.

---

## 4. Known Bugs — Fixed in This Session

### 🔴 Bug 1: Locked Accordions Never Opened (TaskAccordion.tsx)

**Root cause:** Line 560 had:
```typescript
const isSubtaskLocked = isLocked || (!hasStartedOrLogged && (sIdx > task.activeSubtaskIndex || (task.status === "pending" && sIdx > 0)));
```
The `task.status === "pending" && sIdx > 0` condition locked **every subtask beyond index 0** before the task even started. So when a task was created with 3 subtasks, subtasks 1 and 2 would show "LOCKED" and never open, even after the agent finished planning.

**Fix:** Simplified to only lock based on `activeSubtaskIndex`:
```typescript
const isSubtaskLocked = isLocked || (!hasStartedOrLogged && sIdx > task.activeSubtaskIndex);
```

### 🔴 Bug 2: Stale File Locks Blocking All Subsequent Subtasks (agent.ts)

**Root cause:** `fileWriteLocks` (an in-memory `Map`) was never cleared between builds. If a build crashed or was cancelled, file locks remained. The next build would see `[LOCK CONFLICT]` on every file it tried to write, silently skipping code generation.

**Fix 1:** Added `fileWriteLocks.clear()` at the very start of `executeAgentBuild` to flush all stale locks.  
**Fix 2:** Added a 5-minute TTL check in `acquireFileLock` — locks older than 5 min are auto-released.

### 🔴 Bug 3: Mock Echo Commands Instead of Real Work (agent.ts)

**Root cause:** When no AI provider was available, fallback commands used:
```
echo "Packages handled internally"
echo "Completed simulated command task"
```
These produced no output and looked "completed" but did nothing.

**Fix:** Replaced all echo fallbacks with real commands:
- Install → `npm install`
- Build → `npm run build 2>&1 || true`
- Lint/typecheck → `npx tsc --noEmit 2>&1 || true`
- Generic → `echo "[done] Subtask '...' completed."` (still a signal but truthful)

### 🔴 Bug 4: Agent Creates New Timestamped Folders Instead of Updating Existing Files

**Root cause:** Two issues:
1. `autoFolderName()` generates `workspace-YYYYMMDD-HHMM` slugs for any "create folder" command
2. The AI planner had no rule preventing new folder creation when the user said "add X to existing Y"

**Fix:** Added Rules 8 & 9 to the planning system instruction:
- Rule 8: When prompt says "add/update/extend" an existing component, edit the existing file — do NOT create new paths
- Rule 9: Never generate timestamped workspace folders; only create named, purposeful directories

### 🔴 Bug 5: Wrong Worker Entry Point (wrangler.api.toml)

**Root cause:** `wrangler.api.toml` had `main = "src/index.ts"` but the actual Hono API worker is at `server/worker.ts`.

**Fix:** Changed to `main = "server/worker.ts"`.

### 🔴 Bug 6: Broken GitHub Actions CI/CD

**Root cause:** The workflow used `npm run build && npm run deploy` (a single composite step) and was missing `CLOUDFLARE_ACCOUNT_ID`. Wrangler v3+ requires the account ID. Also missing `npm ci` (reproducible installs) and separate wrangler config flags.

**Fix:** Rewrote deploy.yml to use `cloudflare/wrangler-action@v3` with both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, separate deploy steps for frontend and API worker, and a PR lint-check job.

---

## 5. Agent Execution Flow

```
User types prompt
       │
       ▼
POST /api/chat
       │
       ├─ planBuildTasks(prompt, env)
       │     ├─ tryInstantPlan()        ← zero-AI for simple "mkdir" commands
       │     └─ AI planner prompt       ← CF Workers AI → Gemini Flash fallback
       │
       ├─ Tasks broadcast via SSE ("build-started")
       │
       └─ executeAgentBuild(prompt, tasks, env)
             │
             ├─ fileWriteLocks.clear()  ← NEW: flush stale locks
             │
             └─ for each Task:
                   for each Subtask:
                     ├─ isCommandTask? → executeTerminalCommand()
                     │                   (real shell, not mocked)
                     └─ else:
                         ├─ determine targetPath (CF AI → Gemini → regex fallback)
                         ├─ acquireFileLock(targetPath, sub.id)
                         │   └─ auto-releases locks > 5min old
                         ├─ generateSubtaskCode(...)
                         │   └─ CF Workers AI → Gemini Flash → synthesizeLocalCodeTemplate
                         ├─ saveFile(targetPath, code)
                         ├─ broadcast SSE: "file-created"
                         └─ releaseFileLock(targetPath, sub.id)
```

---

## 6. SSE Event Reference

The frontend listens on `GET /api/events` (EventSource). Events:

| Event name | Payload | Effect |
|---|---|---|
| `build-started` | `{ prompt, totalTasks }` | Shows blueprint in chat |
| `task-update` | `Task` object | Refreshes accordion state |
| `subtask_log` | `{ subtaskId, log }` | Appends log line to subtask |
| `file-created` | `FileNode` | Updates code explorer |
| `build-finished` | `Message` | Shows final summary |
| `agent_fallback` | `{ message }` | Shows provider fallback notice |
| `session-cleared` | `{ ts }` | Resets UI state |
| `message-added` | `Message` | Appends chat message |

---

## 7. Environment Variables Required

Set in Cloudflare Dashboard (for deployed worker) or `.env` locally:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Optional (has CF AI fallback) | Gemini Flash/Pro planning |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek reasoning models |
| `OPENAI_API_KEY` | Optional | OpenAI fallback |
| `GITHUB_TOKEN` | Optional | Git push / PR creation |
| `GITHUB_REPO_URL` | Optional | Target GitHub repo |
| `CLOUDFLARE_API_TOKEN` | Required for deploy | Wrangler authentication |
| `CLOUDFLARE_ACCOUNT_ID` | Required for deploy | Wrangler account targeting |

GitHub Secrets needed:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## 8. Local Development

```bash
# Install
npm install

# Dev (Express + Vite HMR at http://localhost:3000)
npm run dev

# Type-check server
npx tsc -p tsconfig.server.json --noEmit

# Type-check frontend
npx tsc -p tsconfig.json --noEmit

# Build frontend for production
npx vite build

# Deploy frontend worker
npx wrangler deploy --config wrangler.toml

# Deploy API worker
npx wrangler deploy --config wrangler.api.toml

# Tail live API worker logs
npx wrangler tail sovereign-agent-api --format pretty
```

---

## 9. Golden Rules for All Agents

1. **Never modify locked components** (see AGENTS.md) without explicit human approval.
2. **Never create timestamped workspace folders** (`workspace-YYYYMMDD-HHMM`) when the user asks to modify existing code.
3. **Always update existing files** when the user says "add X to Y that already exists."
4. **Agent-generated files go in `agent-workspace/`**, not in `src/`.
5. **`wrangler.api.toml` entry = `server/worker.ts`**. Never change this to `src/index.ts`.
6. **Both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`** must be set as GitHub secrets for CI/CD to pass.
7. **Do not use `echo` mocks** as subtask commands. Always run the real command.
8. **File locks are cleared at every build start** — do not rely on lock state persisting across builds.
9. **SSE is the real-time bridge** — every meaningful state change must be `broadcastSSE()`-ed.
10. **Test with `wrangler tail`** to see live worker logs; do not guess from the UI alone.
