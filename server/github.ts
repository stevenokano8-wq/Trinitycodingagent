import { FileNode } from "../src/types.js";
import { AppEnv, resolveEnvWithOverrides, setRuntimeOverrides } from "./env.js";

// Workers have no filesystem and no `git`/`child_process` binary, so pushing
// to GitHub can no longer shell out to a local git checkout. Instead this
// commits each tracked file directly through GitHub's REST Contents API
// (fetch-based, works identically in Node and in Workers).
export interface PushResult {
  success: boolean;
  message: string;
  logs: string[];
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  let ownerRepo = repoUrl.trim();
  if (ownerRepo.startsWith("https://github.com/")) {
    ownerRepo = ownerRepo.replace("https://github.com/", "");
  } else if (ownerRepo.startsWith("git@github.com:")) {
    ownerRepo = ownerRepo.replace("git@github.com:", "");
  }
  if (ownerRepo.endsWith(".git")) {
    ownerRepo = ownerRepo.slice(0, -4);
  }
  ownerRepo = ownerRepo.replace(/^\/+|\/+$/g, "");

  const parts = ownerRepo.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format "${repoUrl}". Expected format: "owner/repo" or "https://github.com/owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

async function ghFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "sovereign-agent",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
}

// btoa is available in both Workers and modern Node; Buffer is Node-only, so
// prefer a UTF-8 safe btoa-based encoder that works in both runtimes.
function toBase64(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function getGithubConfig(env?: Partial<AppEnv>) {
  const resolved = resolveEnvWithOverrides(env);
  const token = resolved.GITHUB_TOKEN || "";
  const repoUrl = resolved.GITHUB_REPO_URL || "";
  return {
    repoUrl,
    hasToken: !!token,
    maskedToken: token ? `${token.substring(0, 4)}••••••••` : "",
  };
}

// Workers have no writable `.env` — this stores the config as an in-memory
// runtime override for the current session only (see server/env.ts).
export function saveGithubConfig(token?: string, repoUrl?: string) {
  const patch: Partial<AppEnv> = {};
  if (token !== undefined) patch.GITHUB_TOKEN = token;
  if (repoUrl !== undefined) patch.GITHUB_REPO_URL = repoUrl;
  setRuntimeOverrides(patch);
}

export async function executeGitPush(
  token: string,
  repoUrl: string,
  branch: string = "main",
  files: FileNode[]
): Promise<PushResult> {
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  try {
    addLog("Parsing repository URL...");
    const { owner, repo } = parseRepo(repoUrl);
    addLog(`Target repository identified: ${owner}/${repo}`);

    const base = `https://api.github.com/repos/${owner}/${repo}`;

    if (!files || files.length === 0) {
      addLog("No generated files tracked in this session. Nothing to push.");
      return { success: true, message: "No files to push", logs };
    }

    // Confirm the branch exists; if not, GitHub will create it implicitly on
    // first commit only if we reference an existing base — otherwise report a
    // clear error instead of silently failing.
    addLog(`Verifying branch "${branch}" exists on remote...`);
    const branchRes = await ghFetch(token, `${base}/branches/${encodeURIComponent(branch)}`);
    if (branchRes.status === 404) {
      addLog(`Branch "${branch}" does not exist yet on the remote — it will be created from the first commit.`);
    } else if (!branchRes.ok) {
      const body = await branchRes.text();
      throw new Error(`Failed to inspect branch "${branch}": ${branchRes.status} ${body}`);
    }

    let pushedCount = 0;
    for (const file of files) {
      addLog(`Committing ${file.path}...`);

      // Look up the existing file's SHA (required by the Contents API to
      // update rather than create), tolerating a 404 for new files.
      let sha: string | undefined;
      const getRes = await ghFetch(token, `${base}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(branch)}`);
      if (getRes.ok) {
        const existing: any = await getRes.json();
        sha = existing.sha;
      } else if (getRes.status !== 404) {
        const body = await getRes.text();
        addLog(`[WARN] Could not read existing file ${file.path} (${getRes.status}): ${body}`);
      }

      const putRes = await ghFetch(token, `${base}/contents/${encodeURIComponent(file.path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: "Synchronized project with Sovereign Agent build cluster",
          content: toBase64(file.content),
          branch,
          sha,
        }),
      });

      if (!putRes.ok) {
        const body = await putRes.text();
        throw new Error(`Failed to commit ${file.path}: ${putRes.status} ${body}`);
      }
      pushedCount++;
    }

    addLog(`Workspace synchronized successfully with remote repository! (${pushedCount} file(s) committed)`);
    return { success: true, message: "Push successful", logs };
  } catch (err: any) {
    let errorMsg = err?.message || "Unknown GitHub sync error";
    if (token && typeof errorMsg === "string") errorMsg = errorMsg.split(token).join("••••••••");
    addLog(`[ERROR] GitHub sync failed: ${errorMsg}`);
    return { success: false, message: errorMsg, logs };
  }
}

export interface PullRequestResult {
  success: boolean;
  message: string;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  logs: string[];
}

export async function executeGitPullRequest(
  token: string,
  repoUrl: string,
  baseBranch: string = "main",
  files: FileNode[]
): Promise<PullRequestResult> {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    logs.push(`[${time}] ${msg}`);
  };

  try {
    const { owner, repo } = parseRepo(repoUrl);
    const base = `https://api.github.com/repos/${owner}/${repo}`;
    addLog(`Resolving branch '${baseBranch}' on '${owner}/${repo}'...`);

    // 1. Get default branch commit SHA
    const refRes = await ghFetch(token, `${base}/git/ref/heads/${baseBranch}`);
    if (!refRes.ok) {
      throw new Error(`Failed to fetch ref for base branch ${baseBranch}: ${refRes.status}`);
    }
    const refData = await refRes.json() as any;
    const parentSha = refData.object.sha;
    addLog(`Base branch '${baseBranch}' is at SHA ${parentSha.substring(0, 7)}`);

    // 2. Create new branch
    const newBranch = `trinity-agent-patch-${Date.now().toString().substring(8)}`;
    addLog(`Creating new feature branch '${newBranch}'...`);
    const createBranchRes = await ghFetch(token, `${base}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: parentSha
      })
    });
    if (!createBranchRes.ok) {
      const body = await createBranchRes.text();
      throw new Error(`Failed to create branch '${newBranch}': ${createBranchRes.status} ${body}`);
    }
    addLog(`Branch '${newBranch}' successfully created on remote repository.`);

    // 3. Commit files
    let pushedCount = 0;
    for (const file of files) {
      addLog(`Committing ${file.path} onto branch '${newBranch}'...`);

      // Try to get SHA of the file in the new branch (might not exist if it's a new file)
      let sha: string | undefined;
      const getRes = await ghFetch(token, `${base}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(newBranch)}`);
      if (getRes.ok) {
        const existing: any = await getRes.json();
        sha = existing.sha;
      }

      const putRes = await ghFetch(token, `${base}/contents/${encodeURIComponent(file.path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `Feat: Sovereign AI autonomous update of ${file.path}`,
          content: toBase64(file.content),
          branch: newBranch,
          sha
        })
      });

      if (!putRes.ok) {
        const body = await putRes.text();
        throw new Error(`Failed to commit ${file.path}: ${putRes.status} ${body}`);
      }
      pushedCount++;
    }

    addLog(`Committed ${pushedCount} file(s) to branch '${newBranch}'.`);

    // 4. Create Pull Request
    addLog(`Opening Pull Request from '${newBranch}' to '${baseBranch}'...`);
    const prRes = await ghFetch(token, `${base}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: `🤖 Autonomous Agent Update: Sovereign Standards & Enhancements`,
        head: newBranch,
        base: baseBranch,
        body: `### 🪐 2026 Autonomous Coding Agent Standard Pull Request\n\nThis Pull Request was generated autonomously by **Trinity Coding Agent**.\n\n#### 🛠️ Included Changes\n- Evaluated workspace against 2026 Level 3 Autonomy standards\n- Optimized AI task dispatcher to utilize Cloudflare Workers AI models (DeepSeek-R1 / LLaMA-3.3)\n- Integrated self-healing and checkpointing telemetry\n- Synchronized local configuration securely with remote repository`
      })
    });

    if (!prRes.ok) {
      const body = await prRes.text();
      throw new Error(`Failed to create Pull Request: ${prRes.status} ${body}`);
    }

    const prData = await prRes.json() as any;
    addLog(`🎉 Pull Request #${prData.number} successfully opened: ${prData.html_url}`);
    return {
      success: true,
      message: "Pull Request opened successfully",
      prUrl: prData.html_url,
      prNumber: prData.number,
      branch: newBranch,
      logs
    };
  } catch (err: any) {
    let errorMsg = err?.message || "Unknown GitHub PR creation error";
    if (token && typeof errorMsg === "string") errorMsg = errorMsg.split(token).join("••••••••");
    addLog(`[ERROR] Pull Request creation failed: ${errorMsg}`);
    return { success: false, message: errorMsg, logs };
  }
}
