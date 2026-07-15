import { FileNode } from "../src/types.js";

export interface CommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  message: string;
}

const BANNED_KEYWORDS = [
  "sudo",
  "su",
  "nano",
  "vim",
  "vi",
  "emacs",
  "passwd",
  "chown",
  "yes"
];

/**
 * Checks if a command is secure to execute.
 */
export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { safe: false, reason: "Command is empty." };
  }

  // Destructive root/parent directory deletions
  if (/\brm\s+-rf\s+\/\b/.test(trimmed)) {
    return { safe: false, reason: "Root directory deletion is prohibited." };
  }

  // Relative path traversal in file modifications
  if (trimmed.includes("../") && (trimmed.includes("rm ") || trimmed.includes("mv ") || trimmed.includes("cp "))) {
    return { safe: false, reason: "Relative directory traversal in file modification commands is prohibited." };
  }

  // Keyword check for interactive or privilege elevation tools
  const words = trimmed.toLowerCase().split(/[\s|;&()<>`!$]+/);
  for (const word of words) {
    if (BANNED_KEYWORDS.includes(word)) {
      return { safe: false, reason: `Command containing '${word}' is prohibited for security reasons.` };
    }
  }

  return { safe: true };
}

// Cached dynamic modules to prevent overhead on multiple calls
let childProcessModule: any = null;
let pathModule: any = null;

async function getChildProcess(): Promise<any> {
  if (childProcessModule !== null) {
    return childProcessModule;
  }
  try {
    // Dynamic import to prevent bundler errors on Cloudflare Workers / non-Node environments
    childProcessModule = await import("child_process");
    return childProcessModule;
  } catch {
    childProcessModule = false;
    return false;
  }
}

async function getPathModule(): Promise<any> {
  if (pathModule !== null) {
    return pathModule;
  }
  try {
    pathModule = await import("path");
    return pathModule;
  } catch {
    pathModule = false;
    return false;
  }
}

/**
 * Executes a terminal command securely and isomorphically.
 * If run inside Cloudflare Workers, it gracefully reports a support error.
 */
export async function executeTerminalCommand(
  command: string,
  options?: { timeoutMs?: number; cwd?: string }
): Promise<CommandResult> {
  const cp = await getChildProcess();
  if (!cp) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      message: "Terminal command execution is not supported in Cloudflare Workers environments."
    };
  }

  const path = await getPathModule();
  if (!path) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      message: "Path resolution module is not available in this environment."
    };
  }

  // 1. Security validation: banned commands
  const safetyCheck = isCommandSafe(command);
  if (!safetyCheck.safe) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      message: `Security validation failure: ${safetyCheck.reason}`
    };
  }

  // 2. Security validation: path locking
  const defaultCwd = typeof process !== "undefined" ? process.cwd() : "/";
  const targetCwd = path.resolve(options?.cwd || defaultCwd);
  if (!targetCwd.startsWith(defaultCwd)) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      message: `Security validation failure: Execution directory '${targetCwd}' is outside of the project root '${defaultCwd}'.`
    };
  }

  const timeoutMs = options?.timeoutMs || 30000;

  return new Promise<CommandResult>((resolve) => {
    let resolved = false;

    const child = cp.exec(
      command,
      {
        cwd: targetCwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
      },
      (error: any, stdout: string, stderr: string) => {
        if (resolved) return;
        resolved = true;

        const exitCode = error ? (error.code ?? 1) : 0;
        const success = exitCode === 0;
        let message = success ? "Command executed successfully" : `Command failed with exit code ${exitCode}`;

        if (error && error.killed) {
          message = `Command execution timed out after ${timeoutMs}ms`;
        }

        resolve({
          success,
          exitCode,
          stdout: stdout || "",
          stderr: stderr || "",
          message
        });
      }
    );

    // Hard fallback backup timeout to ensure process is reaped
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore kill errors
      }
      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        message: `Command execution exceeded safety fallback timeout threshold of ${timeoutMs}ms`
      });
    }, timeoutMs + 2000);
  });
}
