/**
 * SPEC-CORE-025: played ranges captured from a real `<video>` in Chromium,
 * where the position comes from the browser's own media clock.
 *
 * Served from a routed origin rather than `file://`: the profile lives in a
 * cookie, which Chromium does not keep for `file://` pages, and the requests
 * have to leave the page to be intercepted.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

import { OUT_DIR } from "./build-bundle";

const ORIGIN = "http://fixture.test";
const MEDIA_SECONDS = 60;
const PLAY_MS = 12_500;
/** Away from 0, so a range pinned to the start of the file cannot pass. */
const START_AT = 20;

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

/** Silent 8-bit mono PCM: the smallest thing Chromium plays in a `<video>`. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
}

interface Recorded {
  __playedRangeSends?: { url: string; keepalive: boolean; body: string }[];
}

interface Range {
  start: number;
  end: number;
}

async function serve(page: Page): Promise<void> {
  const wav = silentWav(MEDIA_SECONDS);
  await page.context().addCookies([
    { name: "lit_viewer", value: "kaori", url: ORIGIN },
  ]);
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.endsWith("/played-ranges")) {
        await route.fulfill({ status: 204 });
      } else if (url.pathname.endsWith("/progress") && route.request().method() === "GET") {
        await route.fulfill({ json: { position: 0, duration: 0 } });
      } else {
        await route.fulfill({ json: {} });
      }
      return;
    }
    if (url.pathname === "/media/tone.wav") {
      // Chromium seeks only in media served with byte ranges.
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
      const from = range ? Number(range[1]) : 0;
      const to = range && range[2] ? Number(range[2]) : wav.length - 1;
      await route.fulfill({
        status: range ? 206 : 200,
        body: wav.subarray(from, to + 1),
        headers: {
          "Content-Type": "audio/wav",
          "Accept-Ranges": "bytes",
          ...(range ? { "Content-Range": `bytes ${from}-${to}/${wav.length}` } : {}),
        },
      });
      return;
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(OUT_DIR, rel));
    if (!file.startsWith(OUT_DIR)) {
      await route.fulfill({ status: 404 });
      return;
    }
    try {
      await route.fulfill({
        body: readFileSync(file),
        contentType: TYPES[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

test("SPEC-CORE-025 a real video sends the stretch it played, with keepalive", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await serve(page);

  await page.goto(`${ORIGIN}/index.html#played-ranges`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "played-ranges");
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector("#played-ranges-video") as HTMLVideoElement).duration,
      ),
    )
    .toBeCloseTo(MEDIA_SECONDS, 0);

  const startedAt = await page.evaluate(async (at) => {
    const video = document.querySelector("#played-ranges-video") as HTMLVideoElement;
    video.currentTime = at;
    await new Promise((done) => video.addEventListener("seeked", done, { once: true }));
    await video.play();
    return video.currentTime;
  }, START_AT);
  expect(startedAt).toBeCloseTo(START_AT, 0);
  await page.waitForTimeout(PLAY_MS);
  const reached = await page.evaluate(() => {
    const video = document.querySelector("#played-ranges-video") as HTMLVideoElement;
    video.pause();
    return video.currentTime;
  });
  expect(reached - startedAt).toBeGreaterThan(10);

  await page.locator("#played-ranges-unmount").click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as Recorded).__playedRangeSends?.length ?? 0))
    .toBeGreaterThan(0);
  const sent = await page.evaluate(() => (window as unknown as Recorded).__playedRangeSends ?? []);

  for (const s of sent) {
    expect(s.url).toMatch(/\/api\/files\/e2e-media\/played-ranges$/);
    expect(s.keepalive).toBe(true);
  }
  const ranges = sent.flatMap((s) => (JSON.parse(s.body) as { ranges: Range[] }).ranges);
  expect(ranges.length).toBeGreaterThan(0);

  const first = Math.min(...ranges.map((r) => r.start));
  const last = Math.max(...ranges.map((r) => r.end));
  const total = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  expect(Math.abs(first - startedAt)).toBeLessThanOrEqual(1);
  expect(Math.abs(last - reached)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(total - (reached - startedAt))).toBeLessThanOrEqual(1.5);
});
