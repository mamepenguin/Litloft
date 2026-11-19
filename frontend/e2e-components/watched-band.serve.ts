/**
 * Serves the bundle from a routed origin (the profile lives in a cookie,
 * which Chromium does not keep for `file://`), with a 60 s silent file and a
 * `played-segments` answer of levels 1, 2 and 3 in segments 0, 1 and 2.
 */

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

import { OUT_DIR } from "./build-bundle";

export const ORIGIN = "http://fixture.test";
export const MEDIA_SECONDS = 60;
export const SEGMENTS = [
  { index: 0, played_seconds: 5 },
  { index: 1, played_seconds: 10 },
  { index: 2, played_seconds: 15 },
];

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

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

export interface OpenedBand {
  segmentsServed: () => boolean;
}

export async function openBand(page: Page): Promise<OpenedBand> {
  const wav = silentWav(MEDIA_SECONDS);
  let served = false;
  await page.context().addCookies([{ name: "lit_viewer", value: "kaori", url: ORIGIN }]);
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.endsWith("/played-segments")) {
        served = true;
        await route.fulfill({ json: { segment_seconds: 5, segments: SEGMENTS } });
      } else if (url.pathname.endsWith("/played-ranges")) {
        await route.fulfill({ status: 204 });
      } else if (url.pathname.endsWith("/progress") && route.request().method() === "GET") {
        await route.fulfill({ json: { position: 0, duration: 0 } });
      } else {
        await route.fulfill({ json: {} });
      }
      return;
    }
    if (url.pathname === "/media/tone.wav") {
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

  await page.goto(`${ORIGIN}/index.html#watched-band`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "watched-band");
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector("#watched-band-video") as HTMLVideoElement).duration,
      ),
    )
    .toBeCloseTo(MEDIA_SECONDS, 0);
  return { segmentsServed: () => served };
}

/**
 * The visible line: the box the played fill runs in, which exists without
 * the band. `seek-line` itself is the taller box around it.
 */
export function measureLine(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="played-range"]')?.parentElement;
    if (!el) throw new Error("missing the played fill's line");
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BandMeasure {
  band: Box;
  line: Box;
  /** Null where the knob is not an element of its own (a native range thumb). */
  knob: Box | null;
  bandAlpha: number;
  pieces: Array<Box & { rgb: string; alpha: number }>;
}

/** Boxes of the band, its pieces, the seek line and the knob, in one frame. */
export function measureBand(page: Page): Promise<BandMeasure> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const band = document.querySelector('[data-testid="watched-band"]');
    const line = document.querySelector('[data-testid="played-range"]')?.parentElement ?? null;
    const knob = document.querySelector('[data-testid="seek-knob"]');
    if (!band || !line) {
      throw new Error(`missing: band=${!!band} line=${!!line}`);
    }
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const alphaOf = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { rgb: a === 0 ? "none" : `${r}, ${g}, ${b}`, alpha: a / 255 };
    };
    const pieces = Array.from(band.querySelectorAll('[data-testid="watched-piece"]')).map(
      (el) => {
        let opacity = 1;
        for (let node: Element | null = el; node && node !== band.parentElement; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        const { rgb, alpha } = alphaOf(getComputedStyle(el).backgroundColor);
        return { ...box(el), rgb, alpha: alpha * opacity };
      },
    );
    pieces.sort((a, b) => a.x - b.x);
    return {
      band: box(band),
      line: box(line),
      knob: knob ? box(knob) : null,
      bandAlpha: alphaOf(getComputedStyle(band).backgroundColor).alpha,
      pieces,
    };
  });
}

/** D1 and D2, the same for every seek bar variant. */
export function expectBandGeometry(m: BandMeasure): void {
  expect(m.line.height).toBeCloseTo(4, 0);
  expect(m.band.height, "the band is a 3px strip").toBeCloseTo(3, 0);
  expect(m.band.x, "the band starts where the seek line starts").toBeCloseTo(m.line.x, 0);
  expect(m.band.width, "the band spans the seek line").toBeCloseTo(m.line.width, 0);
  if (m.knob) {
    expect(m.band.y + m.band.height, "4px above the knob's top").toBeCloseTo(m.knob.y - 4, 0);
  }
  expect(m.band.y + m.band.height, "8px above the line").toBeCloseTo(m.line.y - 8, 0);
  expect(m.bandAlpha, "no track of its own").toBe(0);

  expect(m.pieces).toHaveLength(3);
  const segment = (5 / MEDIA_SECONDS) * m.line.width;
  [0.35, 0.6, 0.9].forEach((alpha, i) => {
    const piece = m.pieces[i];
    expect(piece.rgb).toBe("255, 255, 255");
    expect(Math.abs(piece.alpha - alpha), `level ${i + 1}`).toBeLessThan(0.01);
    expect(Math.abs(piece.x - (m.line.x + i * segment))).toBeLessThan(1);
    expect(Math.abs(piece.width - segment)).toBeLessThan(1);
    expect(piece.y).toBeCloseTo(m.band.y, 0);
    expect(piece.height).toBeCloseTo(3, 0);
  });
}
