import { executeTerminalCommand, CommandResult, isCommandSafe } from "./command.js";

/**
 * Strips ANSI escape codes from terminal outputs to make them readable in standard markdown or logs.
 */
export function stripAnsi(text: string): string {
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

/**
 * Formats command results cleanly for LLM consumption.
 * Useful for building self-healing compilation / test loops.
 */
export function formatCommandResultForAgent(command: string, result: CommandResult): string {
  const cleanStdout = stripAnsi(result.stdout).trim();
  const cleanStderr = stripAnsi(result.stderr).trim();

  let formatted = `### Command: \`${command}\`\n`;
  formatted += `**Status**: ${result.success ? "✅ Success" : "❌ Failed"} (Exit Code: ${result.exitCode ?? "N/A"})\n`;
  formatted += `**Message**: ${result.message}\n\n`;

  if (cleanStdout) {
    formatted += `#### Standard Output (stdout):\n\`\`\`\n${cleanStdout}\n\`\`\`\n\n`;
  }
  if (cleanStderr) {
    formatted += `#### Error Output (stderr):\n\`\`\`\n${cleanStderr}\n\`\`\`\n`;
  }

  return formatted;
}

// Re-export core command execution functions for unified terminal capability
export { executeTerminalCommand, isCommandSafe };
export type { CommandResult };
