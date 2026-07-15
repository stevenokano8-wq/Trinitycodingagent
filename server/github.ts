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
