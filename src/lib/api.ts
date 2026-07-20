// In our self-contained full-stack container hosted environment, the backend and
// frontend are served from the same origin, so API calls must always be relative.
// However, in production, the assets are served from the static assets domain,
// so we route API requests to the API gateway.
const isProd = typeof window !== "undefined" && window.location.hostname === "agent.trinityuniverse.org";
export const API_BASE = isProd ? "https://agent-api.trinityuniverse.org" : "";

