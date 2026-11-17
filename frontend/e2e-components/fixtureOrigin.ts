/**
 * The component fixture served from an http origin instead of `file://`.
 *
 * Chromium does not reliably share `localStorage` between `file://`
 * documents: on a loaded CI runner a value written before a reload reads
 * back as null afterwards, and a second page of the same context never
 * receives the `storage` event. A spec that reloads, or that reads one
 * page's write from another, loads the fixture through here.
 *
 * `localhost` because it is a secure context, as `file://` is, so nothing
 * else about the page changes. Every request is answered from disk by the
 * route; nothing listens on the port.
 */

import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";

import type { BrowserContext } from "@playwright/test";

import { PAGE } from "./build-bundle";

const ORIGIN = "http://localhost:47391";
const ROOT = dirname(PAGE);

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".vtt": "text/vtt",
  ".woff2": "font/woff2",
};

export const FIXTURE_URL = `${ORIGIN}/${relative(ROOT, PAGE).split(sep).join("/")}`;

export async function serveFixture(context: BrowserContext): Promise<void> {
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = join(ROOT, path);
    // Aborted rather than a 404: under `file://` a fetch nothing stubs, or a
    // file the build does not write, fails as a network error, and the
    // fixtures' stubs leave unanswered endpoints to fail that way.
    const body = file.startsWith(ROOT + sep)
      ? await readFile(file).catch(() => null)
      : null;
    if (body === null) {
      await route.abort();
      return;
    }
    await route.fulfill({
      body,
      contentType: TYPES[extname(file)] ?? "application/octet-stream",
    });
  });
}
