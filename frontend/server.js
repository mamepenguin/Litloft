// This file runs in Docker production. For local dev, use `pnpm dev`.
const http = require("http");
const httpProxy = require("http-proxy");
const { isInternalApiPath, isStreamPath } = require("./server-routes.js");

const NEXT_PORT = 3001;
const WS_BACKEND = process.env.BACKEND_URL || "http://backend:8000";
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

process.env.PORT = String(NEXT_PORT);
process.env.HOSTNAME = "127.0.0.1";
require("./server-next.js");

// agent:false disables keep-alive pooling for the Next.js internal proxy.
// Node.js 20 changed globalAgent to keepAlive:true, causing connections to
// accumulate when upstream errors (ECONNRESET from addon restarts) leave
// pooled sockets in a half-open state.
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
