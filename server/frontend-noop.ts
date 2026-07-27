// The "sovereign-agent" worker is asset-only: Wrangler serves everything
// straight out of `dist/` (see [assets] in wrangler.toml) and only falls
// through to this fetch handler for requests assets can't resolve, which
// with `not_found_handling = "single-page-application"` shouldn't normally
// happen. This handler exists only because `main` is required by Wrangler.
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(event: any, env: any, ctx: any) {
    console.log("Sovereign Agent Frontend scheduled cron triggered successfully!");
  }
};

// Legacy Durable Object classes from earlier iterations of this worker
// (Sandbox execution, MCP tool servers, agent orchestration, sessions, rate
// limiting) are still registered against this script account-side. Cloudflare
// requires every deploy to keep exporting a class name it has ever bound,
// to avoid silently orphaning any (possibly SQLite-backed) storage those
// objects hold. None of this repo's code uses them anymore, so these are
// inert stubs kept only to satisfy that platform requirement.
class LegacyDurableObjectStub {
  constructor(_state: unknown, _env: unknown) {}
  async fetch(): Promise<Response> {
    return new Response("This Durable Object class is retired and no longer in use.", { status: 410 });
  }
}

export class Sandbox extends LegacyDurableObjectStub {}
export class SovereignAgentSession extends LegacyDurableObjectStub {}
export class RateLimiter extends LegacyDurableObjectStub {}
export class SovereignSelfHealMCP extends LegacyDurableObjectStub {}
export class SovereignProjectMCP extends LegacyDurableObjectStub {}
export class SovereignFileToolsMCP extends LegacyDurableObjectStub {}
export class SovereignGitToolsMCP extends LegacyDurableObjectStub {}
export class AgentOrchestration extends LegacyDurableObjectStub {}
