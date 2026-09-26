/**
 * Serves the reader the way the app does: `/epub-reader/` only for the
 * reader's own files, each with the policy the proxy sets.
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";

import { epubReaderCsp, isEpubReaderFile, isUnderEpubReader } from "../src/lib/epubReaderCsp";
import {
  fixedLayoutBook,
  flawedBook,
  horizontalBook,
  hostileBook,
  verticalBook,
} from "./fixtures/books";

const PUBLIC_DIR = join(__dirname, "..", "public");
const HOST_PAGE = join(__dirname, "fixtures", "host.html");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function startServer(): Promise<{ server: Server; origin: string }> {
  const books = new Map<string, Buffer>();
  const leaks: { path: string; test: string }[] = [];
  const server = createServer((req, res) => {
    const rawPath = (req.url ?? "/").split(/[?#]/, 1)[0];
    if (rawPath.startsWith("/leak/")) {
      leaks.push({ path: rawPath, test: String(req.headers["x-e2e-test"] ?? "") });
      res.writeHead(200, { "Content-Type": "text/css" }).end("");
      return;
    }
    if (rawPath === "/leaks") {
      const test = new URL(req.url ?? "/", "http://x").searchParams.get("test");
      const mine = leaks.filter((l) => l.test === test).map((l) => l.path);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(mine));
      return;
    }
    if (isUnderEpubReader(rawPath)) {
      if (!isEpubReaderFile(rawPath)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[extname(rawPath)] ?? "application/octet-stream",
        "Content-Security-Policy": epubReaderCsp(req.headers.host ?? null),
      });
      res.end(readFileSync(join(PUBLIC_DIR, rawPath)));
      return;
    }
    if (rawPath === "/host.html") {
      res.writeHead(200, { "Content-Type": TYPES[".html"] }).end(readFileSync(HOST_PAGE));
      return;
    }
    if (rawPath === "/evil.js") {
      res
        .writeHead(200, { "Content-Type": TYPES[".js"] })
        .end("top.__pwned = (top.__pwned || []).concat(['same-host-js'])");
      return;
    }
    const book = books.get(rawPath.replace(/^\/books\//, ""));
    if (book) {
      res.writeHead(200, { "Content-Type": "application/epub+zip" }).end(book);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  books.set("horizontal.epub", horizontalBook());
  books.set("vertical.epub", verticalBook());
  books.set("fixed.epub", fixedLayoutBook());
  books.set("flawed.epub", flawedBook());
  books.set("hostile.epub", hostileBook(origin));
  return { server, origin };
}
