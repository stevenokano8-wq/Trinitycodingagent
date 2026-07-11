// In production the frontend (sovereign-agent) is a static Cloudflare Worker
// served at agent.trinityuniverse.org. All API calls must go to the separate
// API worker at agent-api.trinityuniverse.org. In local dev both are served
// from the same Express origin, so the base is empty (relative paths work).
export const API_BASE = import.meta.env.PROD
  ? "https://agent-api.trinityuniverse.org"
  : "";
