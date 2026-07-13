import { AppEnv, resolveEnvWithOverrides } from "./env.js";

export interface RoutingResult {
  complexity: "simple" | "complex";
  score: number; // 0 (simplest) to 10 (most complex)
  model: string; // The model ID to use
  reason: string; // Human-friendly routing rationale
}

/**
 * Analyzes the complexity of a user prompt or subtask name
 * and selects either "gemini-3.5-flash" (Flash) or "gemini-3.1-pro-preview" (Pro).
 */
export function routeLLMTask(
  prompt: string,
  subtaskName?: string,
  attachmentName?: string
): RoutingResult {
  const textToAnalyze = `${prompt} ${subtaskName || ""} ${attachmentName || ""}`.toLowerCase();

  // 1. Check for explicit model overrides
  if (textToAnalyze.includes("force pro") || textToAnalyze.includes("use pro")) {
    return {
      complexity: "complex",
      score: 10,
      model: "gemini-3.1-pro-preview",
      reason: "Explicit user override requested the 'Pro' model."
    };
  }
  if (textToAnalyze.includes("force flash") || textToAnalyze.includes("use flash")) {
    return {
      complexity: "simple",
      score: 0,
      model: "gemini-3.5-flash",
      reason: "Explicit user override requested the 'Flash' model."
    };
  }

  // 2. Score based on key complexity indicators
  let score = 0;
  const reasons: string[] = [];

  // Dimension A: Architecture & Storage (High Complexity)
  const dbIndicators = ["database", "schema", "d1", "sqlite", "postgresql", "sql", "drizzle", "migration", "table", "query", "queries", "insert", "select"];
  const authIndicators = ["oauth", "auth", "login", "register", "session", "jwt", "token", "sign in", "sign-in", "signout", "permission", "security"];
  const serverIndicators = ["express", "server.ts", "worker.ts", "endpoint", "api route", "backend", "websocket", "hono", "proxy", "middleware", "rest api"];

  // Check storage/auth indicators
  const matchedDb = dbIndicators.filter(kw => textToAnalyze.includes(kw));
  if (matchedDb.length > 0) {
    score += Math.min(matchedDb.length * 2, 4);
    reasons.push(`Database/Storage interactions requested (${matchedDb.slice(0, 3).join(", ")})`);
  }

  const matchedAuth = authIndicators.filter(kw => textToAnalyze.includes(kw));
  if (matchedAuth.length > 0) {
    score += Math.min(matchedAuth.length * 2.5, 5);
    reasons.push(`Security or authentication logic detected (${matchedAuth.slice(0, 2).join(", ")})`);
  }

  const matchedServer = serverIndicators.filter(kw => textToAnalyze.includes(kw));
  if (matchedServer.length > 0) {
    score += Math.min(matchedServer.length * 2, 4);
    reasons.push(`Server-side or custom backend routing involved (${matchedServer.slice(0, 3).join(", ")})`);
  }

  // Dimension B: Logic & Reasoning Complexity
  const algorithmIndicators = ["algorithm", "parse", "calculation", "filter", "sort", "charts", "recharts", "d3", "data visualization", "math", "recursive", "router", "state manager"];
  const matchedAlg = algorithmIndicators.filter(kw => textToAnalyze.includes(kw));
  if (matchedAlg.length > 0) {
    score += Math.min(matchedAlg.length * 1.5, 3);
    reasons.push(`Complex rendering, charts, or logical sorting rules found (${matchedAlg.slice(0, 3).join(", ")})`);
  }

  // Dimension C: Scope Scale Indicators
  const scaleIndicators = ["dashboard", "architecture", "modular", "complete application", "bento", "full-stack", "refactor", "restructure", "audit", "find errors", "fix specific bugs"];
  const matchedScale = scaleIndicators.filter(kw => textToAnalyze.includes(kw));
  if (matchedScale.length > 0) {
    score += Math.min(matchedScale.length * 2, 4);
    reasons.push(`Broad architectural scope or advanced debugging requested`);
  }

  // Dimension D: Attachment check
  if (attachmentName) {
    score += 3;
    reasons.push(`Processing external context from file attachment: "${attachmentName}"`);
  }

  // Dimension E: Length/verbosity of the request
  if (prompt.length > 350) {
    score += 1.5;
    reasons.push("Highly detailed or multi-step prompt description");
  }

  // Simplest tasks: simple command execution, theme/styling changes, folders creation
  const isSimpleFileCommand = 
    textToAnalyze.includes("mkdir") || 
    textToAnalyze.includes("create folder") || 
    textToAnalyze.includes("delete file") || 
    textToAnalyze.includes("npm install") || 
    textToAnalyze.includes("install package") || 
    textToAnalyze.includes("run test") || 
    textToAnalyze.includes("run command");

  const isSimpleVisualTweak = 
    textToAnalyze.includes("background") || 
    textToAnalyze.includes("color") || 
    textToAnalyze.includes("font") || 
    textToAnalyze.includes("css") || 
    textToAnalyze.includes("styling") || 
    textToAnalyze.includes("theme");

  if (isSimpleFileCommand && score < 4) {
    score = Math.max(0, score - 2);
  }
  if (isSimpleVisualTweak && score < 3) {
    score = Math.max(0, score - 1.5);
  }

  // Determine classification threshold (score of 4 or higher indicates complex)
  const complexity = score >= 4 ? "complex" : "simple";
  const model = complexity === "complex" ? "gemini-3.1-pro-preview" : "gemini-3.5-flash";

  let finalReason = "";
  if (reasons.length === 0) {
    finalReason = `Standard responsive execution routed to 'Flash' for lightning-fast delivery.`;
  } else {
    const briefReasons = reasons.join("; ");
    finalReason = complexity === "complex"
      ? `Routed to 'Pro' due to high-complexity components: ${briefReasons}`
      : `Routed to 'Flash' for simple/visual task handling: ${briefReasons}`;
  }

  return {
    complexity,
    score: Math.min(10, Math.max(0, score)),
    model,
    reason: finalReason
  };
}
