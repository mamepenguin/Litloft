// The backend's Internal API (/api/internal/*) is intended for the
// Docker-internal network only. It is NOT drive-access gated the way the
// public API is, and several write endpoints accept requests with no viewer
// cookie. Returning 404 (not 403) keeps the endpoint's existence hidden.
function isInternalApiPath(pathname) {
  return pathname === "/api/internal" || pathname.startsWith("/api/internal/");
}

// File stream requests (/api/files/{id}/stream) are routed directly to the
// backend, bypassing the Next.js rewrite layer. The two-hop proxy chain
// (browser → nextProxy → Next.js fetch → backend) causes downloads to stall
// near completion: the response body arrives in full but the final
// connection-close signal is delayed, leaving the browser waiting forever.
const _streamPathRe = /^\/api\/files\/[A-Za-z0-9_-]{12}\/stream$/;
function isStreamPath(pathname) {
  return _streamPathRe.test(pathname);
}

module.exports = { isInternalApiPath, isStreamPath };
