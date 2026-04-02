import { createServer } from "http";
import httpProxy from "http-proxy";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

const proxy = httpProxy.createProxyServer({
  target: BACKEND_URL,
  ws: true,
});

proxy.on("error", (err, _req, res) => {
  if (res && "writeHead" in res) {
    (res as import("http").ServerResponse).writeHead(502);
    (res as import("http").ServerResponse).end("Bad Gateway");
  }
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    if (url.pathname === "/api/ws") {
      proxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port);
});
