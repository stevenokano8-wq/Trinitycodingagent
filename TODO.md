# TODO - Prioritized Fixes and Improvements

This TODO list is a prioritized set of actionable fixes and improvements for the Trinitycodingagent repository. It was generated after a repo scan and is intentionally focused; the rate-limiting item was omitted per instructions.

High priority (must-fix before trusting the agent with real code changes)

1. Fix syntax / truncated template problems
   - Search for `[...]` and incomplete template literals and restore the intended strings.
   - Files to inspect first: `server/agent.ts`, `src/components/DeployView.tsx`, `src/components/NotificationsView.tsx`, `src/components/PermissionsView.tsx`, and any file showing `[...]` placeholders.

2. Replace global cancellation token with per-task cancellation
   - Replace `activeCancellationSignal` with a `Map<taskId, CancellationSignal>` so multiple builds can run concurrently and be canceled individually.
   - File: `server/agent.ts` (update `cancelActiveBuild` and executor checks).

3. Path sanitization and safe file writes
   - Add a `safeJoin(base, candidate)` utility and validate generated file paths to prevent directory traversal (reject `..`, absolute paths, or unexpected separators).
   - Ensure `server/github.ts` and any local file write logic validate file paths before committing to GitHub.

4. Mask secrets in logs and errors
   - Ensure runtime tokens (Gemini, GitHub) are never printed in logs or error messages. Use short masked values when needed.
   - Files: `server/github.ts`, `server/env.ts`, `server/worker.ts`.

5. Make SSE session-scoped and cross-isolate friendly
   - Add session/task scoping to SSE events so clients can subscribe only to their session's updates.
   - Consider Durable Objects or a shared KV/pubsub for cross-isolate fanout (longer-term).

Medium priority (reliability, safety, and UX)

6. Centralize LLM calls with retry/backoff and timeouts
   - Wrap Gemini and Workers AI calls into a single helper that adds retries, exponential backoff, and token accounting.
   - File: `server/agent.ts`.

7. Attachment size/type validation
   - Enforce a maximum size for uploaded attachments and validate MIME types.
   - Reject or sanitize binary/executable uploads.
   - Files: `server/worker.ts` (upload endpoint) and `server/agent.ts` (attachment handling).

8. DB/file size considerations
   - Large generated files might exceed D1 row limits. Consider storing large files in KV or an external blob store and keeping references in D1.
   - Files: `server/db.ts` and `server/github.ts`.

9. Add structured logging, tracing, and metrics
   - Replace ad-hoc console logs with structured logs including task/session ids. Emit metrics for model usage and failures.

Low priority / nice-to-have

10. Add tests (unit + integration)
    - Unit tests for `routeLLMTask`, `classifyPromptIntent`, `generateActionStepsForSubtask`.
    - Integration tests for `planBuildTasks` and `executeAgentBuild` using mocked AI bindings & DB/KV fallbacks.

11. Add a dry-run / preview mode for pushes
    - Allow a "dry run" where generated files are shown and can be iteratively approved before pushing to GitHub.

Notes and next steps

- I have implemented an improved `TaskAccordion` component under `src/components/TaskAccordion.tsx` that follows the visual rules in the supplied screenshots: "N steps" badge, current step chip, step-style log dividers, and a spinner-based running indicator.

- After you review this TODO list, I can continue with any of the high-priority items (I recommend starting with fixing the `[...]` truncations in `server/agent.ts`) or open pull requests for the changes above.

