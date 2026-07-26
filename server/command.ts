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

// Egress exfiltration and reverse shell protection patterns
const EGRESS_EXFILTRATION_PATTERNS = [
  /bash\s+-i/i,
  /sh\s+-i/i,
  /\/dev\/tcp\//i,
  /\/dev\/udp\//i,
  /\bnc\s+-[eE]/i,
  /\bnetcat\b/i,
  /\bcurl\b.*(-F|--form|-d|--data).*@/i,
  /\bwget\b.*--post-file/i,
  /python[0-9.]*\s+-c.*socket/i,
  /perl\s+-e.*socket/i,
  /ruby\s+-e.*TCPSocket/i,
  /\bexec\s+5<>\/dev\/tcp/i,
];

// Pre-compliance hardcoded secrets patterns
const HARDCODED_SECRET_PATTERNS = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub Token", pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: "GitHub OAuth Token", pattern: /gho_[a-zA-Z0-9]{36}/ },
  { name: "Private RSA/EC Key", pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|DSA|PRIVATE)\s+KEY-----/ },
  { name: "Stripe Secret Key", pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: "Google Gemini API Key", pattern: /AIzaSy[0-9a-zA-Z_-]{33}/ },
  { name: "Generic Secret Key", pattern: /(api_key|secret_key|private_key|auth_token)\s*=\s*["'][a-zA-Z0-9_\-]{20,}["']/i },
];

/**
 * Checks if a command is secure to execute (Pillar 3: Guardrails & Egress Protection).
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

  // Egress protection & reverse shell prevention
  for (const pattern of EGRESS_EXFILTRATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: "Potential reverse shell or data exfiltration pattern detected." };
    }
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

/**
 * Pre-compliance lint gate for code before writing/committing (Pillar 3).
 * Detects hardcoded secrets, dangerous egress patterns, and infinite runtime loops.
 */
export function preComplianceLintCheck(code: string, filePath?: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];

  // 1. Hardcoded API secrets check
  for (const secretCheck of HARDCODED_SECRET_PATTERNS) {
    if (secretCheck.pattern.test(code)) {
      violations.push(`Hardcoded secret detected: ${secretCheck.name}. Use process.env variables instead.`);
    }
  }

  // 2. Infinite runtime loop patterns without break/exit
  if (/\bwhile\s*\(\s*true\s*\)\s*\{(?![\s\S]*?\bbreak\b)/.test(code) ||
      /\bfor\s*\(\s*;\s*;\s*\)\s*\{(?![\s\S]*?\bbreak\b)/.test(code)) {
    violations.push("Potential unbounded infinite loop detected without a clear break condition.");
  }

  // 3. Egress or eval abuse check inside non-test source files
  if (filePath && !filePath.includes("test") && !filePath.includes("spec")) {
    if (/\beval\s*\(/.test(code)) {
      violations.push("Usage of 'eval()' is prohibited due to remote code execution risks.");
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
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
 * Streams stdout/stderr via callback if provided.
 */
export async function executeTerminalCommand(
  command: string,
  options?: { 
    timeoutMs?: number; 
    cwd?: string; 
    onStream?: (data: { stdout?: string; stderr?: string }) => void 
  }
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

  // 1. Security validation: banned commands & egress check
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

    if (options?.onStream) {
      if (child.stdout) {
        child.stdout.on("data", (chunk: any) => {
          options.onStream?.({ stdout: String(chunk) });
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (chunk: any) => {
          options.onStream?.({ stderr: String(chunk) });
        });
      }
    }

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
