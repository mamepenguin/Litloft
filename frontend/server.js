// Proxy wrapper: Next.js standalone server + WebSocket proxy to backend
// This file runs in Docker production. For local dev, use `pnpm dev`.
const http = require("http");
const httpProxy = require("http-proxy");

const NEXT_PORT = 3001;
const WS_BACKEND = process.env.BACKEND_URL || "http://backend:8000";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

// Start Next.js standalone on internal port
process.env.PORT = String(NEXT_PORT);
process.env.HOSTNAME = "127.0.0.1";
require("./server-next.js");

// agent:false disables keep-alive pooling for the Next.js internal proxy.
// Node.js 20 changed globalAgent to keepAlive:true, causing connections to
// accumulate when upstream errors (ECONNRESET from addon restarts) leave
// pooled sockets in a half-open state. Using per-request connections avoids
// this leak while keeping latency acceptable (loopback ~0.1ms overhead).
const nextProxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${NEXT_PORT}`,
  agent: false,
});
const backendProxy = httpProxy.createProxyServer({
  target: WS_BACKEND,
  ws: true,
});

nextProxy.on("error", (_e, _req, res) => {
  if (res && res.writeHead) {
    res.writeHead(502);
    res.end();
  }
});
backendProxy.on("error", () => {});

// http-proxy only aborts the upstream request when the *client's request*
// emits 'aborted' (lib/http-proxy/passes/web-incoming.js). For a GET, the
// request body finishes immediately, so that event never fires — if the
// client disconnects while the *response* is still streaming (tab closed,
// navigated away, query superseded), the upstream connection to Next.js
// (or backend) is never torn down. Those orphaned sockets pile up as
// stalled ESTABLISHED/CLOSE_WAIT connections on the Next.js internal port
// until the process runs out of usable sockets. Watching 'close' on the
// client response and destroying the upstream request closes that gap.
function abortUpstreamOnClientClose(proxy) {
  proxy.on("proxyReq", (proxyReq, _req, res) => {
    res.on("close", () => {
      if (!proxyReq.destroyed) proxyReq.destroy();
    });
  });
}
abortUpstreamOnClientClose(nextProxy);
abortUpstreamOnClientClose(backendProxy);

// The backend's Internal API (/api/internal/*) is intended for the
// Docker-internal network only (addon ↔ core service-to-service). It is
// NOT drive-access gated the way the public API is, and several write
// endpoints (file_relations, addon-events, files/{id}/tags) accept
// requests with no viewer cookie. The Next.js rewrite rule
// (`/api/:path*` → backend:8000) would otherwise expose these to any
// browser on the LAN. Reject them at the edge so the only path to the
// Internal API stays the Docker network. Returning 404 (not 403) keeps
// the endpoint's existence hidden, matching the project's
// "404 not 403" access-control rule.
function isInternalApiPath(pathname) {
  return pathname === "/api/internal" || pathname.startsWith("/api/internal/");
}

// File stream requests (/api/files/{id}/stream) are routed directly to the
// backend, bypassing the Next.js rewrite layer. The two-hop proxy chain
// (browser → nextProxy → Next.js fetch → backend) causes downloads to stall
// near completion: the response body arrives in full but the final
// connection-close signal is delayed, leaving the browser waiting forever.
// Direct proxying mirrors how WebSocket (/api/ws) is already handled.
// Authentication is preserved — the browser's hv_token cookie is forwarded.
const _streamPathRe = /^\/api\/files\/\d+\/stream$/;
function isStreamPath(pathname) {
  return _streamPathRe.test(pathname);
}

function tryStart(attempt) {
  http
    .get(`http://127.0.0.1:${NEXT_PORT}`, () => {
      const server = http.createServer((req, res) => {
        let pathname;
        try {
          pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
        } catch {
          res.writeHead(400);
          res.end();
          return;
        }
        if (isInternalApiPath(pathname)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end('{"detail":"Not Found"}');
          return;
        }
        if (isStreamPath(pathname)) {
          backendProxy.web(req, res);
          return;
        }
        nextProxy.web(req, res);
      });
      server.on("upgrade", (req, socket, head) => {
        try {
          const pathname = new URL(req.url, `http://${req.headers.host}`)
            .pathname;
          if (pathname === "/api/ws") {
            backendProxy.ws(req, socket, head);
          } else {
            socket.destroy();
          }
        } catch {
          socket.destroy();
        }
      });
      server.listen(PORT, HOSTNAME);
    })
    .on("error", () => {
      if (attempt > 50) {
        console.error("Next.js failed to start");
        process.exit(1);
      }
      setTimeout(() => tryStart(attempt + 1), 300);
    });
}

tryStart(0);
