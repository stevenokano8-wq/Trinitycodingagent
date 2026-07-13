// Small, dependency-free security helpers shared across the Worker/Node
// server code. Kept intentionally minimal — this project has no filesystem
// on Workers, so "path safety" here means validating the *virtual* file
// paths tracked in D1/in-memory (server/db.ts) before they're used as GitHub
// Contents API keys or D1 primary keys, not filesystem `fs.join` calls.

const MAX_PATH_LENGTH = 512;

// Reject anything that could escape the intended "repo-relative file" shape:
// parent-directory traversal, absolute paths, backslashes, null bytes, or
// empty segments. This runs before any path is committed via the GitHub
// Contents API (server/github.ts) or persisted as a D1/in-memory file key
// (server/db.ts), since both ultimately come from LLM-generated or
// user-influenced subtask names.
export function assertSafeRelativePath(rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new Error("File path must be a non-empty string.");
  }
  if (rawPath.length > MAX_PATH_LENGTH) {
    throw new Error(`File path exceeds maximum length of ${MAX_PATH_LENGTH} characters.`);
  }
  if (rawPath.includes("\0")) {
    throw new Error("File path contains a null byte.");
  }
  if (rawPath.includes("\\")) {
    throw new Error(`Rejected file path "${rawPath}": backslashes are not allowed.`);
  }
  if (rawPath.startsWith("/") || rawPath.startsWith("~")) {
    throw new Error(`Rejected file path "${rawPath}": absolute paths are not allowed.`);
  }
  const segments = rawPath.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      throw new Error(`Rejected file path "${rawPath}": contains an empty or "." path segment.`);
    }
    if (segment === "..") {
      throw new Error(`Rejected file path "${rawPath}": parent-directory traversal ("..") is not allowed.`);
    }
  }
  return rawPath;
}

// Redacts every occurrence of any provided secret value inside a string
// (error messages, logs). Safe to call with undefined/empty secrets.
export function maskSecrets(input: string, secrets: Array<string | undefined>): string {
  let out = input;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join("••••••••");
    }
  }
  return out;
}

// Cloudflare Workers' D1 has a practical per-row text-column ceiling
// (SQLite pages are 4KB; very large TEXT values degrade query/backup
// performance well before the 1GB SQLite text limit is reached). Files
// beyond this size are still accepted, but flagged so callers can warn/skip
// GitHub sync rather than silently failing deep inside the Contents API.
export const MAX_FILE_CONTENT_BYTES = 900_000; // ~900KB

export function isOversizedFileContent(content: string): boolean {
  // Rough byte-length check (UTF-16 length is a safe upper bound for UTF-8 byte length in practice for this guard).
  return content.length > MAX_FILE_CONTENT_BYTES;
}
