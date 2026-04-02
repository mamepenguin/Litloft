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

const nextProxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${NEXT_PORT}`,
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

function tryStart(attempt) {
  http
    .get(`http://127.0.0.1:${NEXT_PORT}`, () => {
      const server = http.createServer((req, res) =>
        nextProxy.web(req, res),
      );
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
