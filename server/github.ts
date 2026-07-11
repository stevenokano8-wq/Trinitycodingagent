import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const execAsync = promisify(exec);

export interface PushResult {
  success: boolean;
  message: string;
  logs: string[];
}

export function getGithubConfig() {
  const token = process.env.GITHUB_TOKEN || "";
  const repoUrl = process.env.GITHUB_REPO_URL || "";
  return {
    repoUrl,
    hasToken: !!token,
    maskedToken: token ? `${token.substring(0, 4)}••••••••` : ""
  };
}

export function saveGithubConfig(token: string, repoUrl: string) {
  const envPath = path.join(process.cwd(), ".env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  const updateEnvVar = (key: string, val: string) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}="${val}"`);
    } else {
      envContent += `\n${key}="${val}"`;
    }
  };

  if (token !== undefined) {
    updateEnvVar("GITHUB_TOKEN", token);
  }
  if (repoUrl !== undefined) {
    updateEnvVar("GITHUB_REPO_URL", repoUrl);
  }

  fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
  dotenv.config({ override: true });
}

export async function executeGitPush(
  token: string,
  repoUrl: string,
  branch: string = "main"
): Promise<PushResult> {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  };

  try {
    addLog("Parsing repository URL...");
    let ownerRepo = repoUrl.trim();
    
    // Support URL like https://github.com/owner/repo or https://github.com/owner/repo.git
    if (ownerRepo.startsWith("https://github.com/")) {
      ownerRepo = ownerRepo.replace("https://github.com/", "");
    } else if (ownerRepo.startsWith("git@github.com:")) {
      ownerRepo = ownerRepo.replace("git@github.com:", "");
    }
    
    if (ownerRepo.endsWith(".git")) {
      ownerRepo = ownerRepo.slice(0, -4);
    }
    
    // Clean up slash issues or leading/trailing characters
    ownerRepo = ownerRepo.replace(/^\/+|\/+$/g, "");
    
    const parts = ownerRepo.split("/");
    if (parts.length !== 2) {
      throw new Error(`Invalid repository format "${repoUrl}". Expected format: "owner/repo" or "https://github.com/owner/repo"`);
    }
    
    const [owner, repo] = parts;
    addLog(`Target repository identified: ${owner}/${repo}`);
    
    const authenticatedUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    
    const cwd = process.cwd();
    addLog("Initializing local Git repository context...");
    
    // Check if .git directory exists, if not initialize it
    if (!fs.existsSync(path.join(cwd, ".git"))) {
      await execAsync("git init", { cwd });
      addLog("Local Git repository initialized.");
    } else {
      addLog("Existing Git context detected.");
    }
    
    // Configure user name and email
    addLog("Configuring Git user credentials...");
    await execAsync('git config user.name "Sovereign Agent"', { cwd });
    await execAsync('git config user.email "agent@sovereign.build"', { cwd });
    
    // Configure the remote URL
    addLog("Configuring remote repository origin...");
    try {
      await execAsync("git remote remove origin", { cwd });
    } catch (e) {
      // Ignore if origin doesn't exist
    }
    await execAsync(`git remote add origin "${authenticatedUrl}"`, { cwd });
    
    // Rename current branch or checkout to target branch
    addLog(`Setting local branch context to "${branch}"...`);
    try {
      // Try to rename current branch to the target branch name first
      await execAsync(`git branch -M "${branch}"`, { cwd });
    } catch (e) {
      // If that fails, try checkouting
      try {
        await execAsync(`git checkout -b "${branch}"`, { cwd });
      } catch (e2) {
        await execAsync(`git checkout "${branch}"`, { cwd });
      }
    }
    
    // Stage all changes
    addLog("Staging modified project files...");
    await execAsync("git add -A", { cwd });
    
    // Check if there are any changes to commit
    let hasChanges = false;
    try {
      const statusOutput = await execAsync("git status --porcelain", { cwd });
      if (statusOutput.stdout.trim().length > 0) {
        hasChanges = true;
      }
    } catch (e) {
      hasChanges = true; // Fallback to try commit
    }
    
    if (hasChanges) {
      addLog("Creating commit snapshot...");
      await execAsync(`git commit -m "Synchronized project with Sovereign Agent build cluster"`, { cwd });
      addLog("Changes committed successfully.");
    } else {
      addLog("No changes detected in workspace. Proceeding to synchronize remote...");
    }
    
    // Push the changes using force push to make sure it succeeds even if remote is out of sync
    addLog(`Pushing files to remote branch origin/${branch}...`);
    const pushCmd = `git push -u origin "${branch}" --force`;
    await execAsync(pushCmd, { cwd });
    addLog("Workspace synchronized successfully with remote repository!");
    
    return {
      success: true,
      message: "Push successful",
      logs
    };
  } catch (err: any) {
    let errorMsg = err.message || "Unknown Git operation error";
    // Sanitize any token leaks
    if (token) {
      errorMsg = errorMsg.split(token).join("••••••••");
    }
    addLog(`[ERROR] Git push failed: ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
      logs
    };
  }
}
