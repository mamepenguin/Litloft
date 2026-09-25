/**
 * Carrying a player frame between its slot and the viewport when
 * pseudo-fullscreen opens and closes, in a real browser, for a caller that
 * pins the frame a commit late (the real VideoPlayer) and one that pins it in
 * the same render (the shape of the YouTube embed).
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Sample {
  frame: Box;
  after: number;
}

declare global {
  interface Window {
    __animations: Animation[];
    __holdAnimations: boolean;
    __samples: Sample[] | null;
    __markAt: number;
  }
}

const ARRANGEMENTS = [
  { id: "player-transition", sibling: null },
  { id: "player-transition-same-render", sibling: "#sibling-row" },
] as const;

const ORIENTATIONS = [
  { name: "portrait", width: 393, height: 851 },
  { name: "landscape", width: 851, height: 393 },
] as const;

async function arrange(page: Page, id: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    // Pseudo-fullscreen is the fallback for a platform that refuses the
    // real thing; Chromium would otherwise grant it.
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("refused"));
    window.__animations = [];
    window.__holdAnimations = false;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      if (window.__holdAnimations) animation.pause();
      window.__animations.push(animation);
      return animation;
    };
  });
  await page.goto(`${FIXTURE}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

const frame = (page: Page) => page.locator("#player [data-testid='player-frame']");
const fullscreenButton = (page: Page) =>
  frame(page).getByRole("button", { name: "Full screen", exact: true });

/**
 * In landscape the frame is taller than the viewport, and clicking the
 * button would scroll the page first; bring it into view before measuring
 * the slot the frame leaves.
 */
async function reachButton(page: Page) {
  await fullscreenButton(page).scrollIntoViewIfNeeded();
}

async function rectOf(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** The frame as drawn: its transformed box, inset by its clip scaled with it. */
async function visibleFrame(page: Page): Promise<Box> {
  return frame(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const scale = r.width / (el as HTMLElement).offsetWidth;
    const clip = getComputedStyle(el).clipPath;
    const numbers = (clip.match(/inset\(([^)]*)\)/)?.[1] ?? "0px")
      .split("round")[0]
      .trim()
      .split(/\s+/)
      .map((v) => parseFloat(v));
    const [top, right = top, bottom = top, left = right] = numbers;
    return {
      left: r.left + left * scale,
      top: r.top + top * scale,
      width: r.width - (left + right) * scale,
      height: r.height - (top + bottom) * scale,
    };
  });
}

function expectSameBox(actual: Box, expected: Box) {
  for (const key of ["left", "top", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(1);
  }
}

/**
 * Records, on every animation frame, where the frame is drawn and where the
 * page under it sits — the one-commit gaps between the hook and a caller's
 * pin classes last a single frame, which a paused measurement never sees.
 */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    window.__samples = [];
    const frameEl = document.querySelector<HTMLElement>("#player [data-testid='player-frame']")!;
    const afterEl = document.getElementById("after-player")!;
    const tick = () => {
      if (!window.__samples) return;
      const r = frameEl.getBoundingClientRect();
      const scale = r.width / frameEl.offsetWidth;
      const numbers = (getComputedStyle(frameEl).clipPath.match(/inset\(([^)]*)\)/)?.[1] ?? "0px")
        .split("round")[0]
        .trim()
        .split(/\s+/)
        .map((v) => parseFloat(v));
      const [top, right = top, bottom = top, left = right] = numbers;
      window.__samples.push({
        frame: {
          left: r.left + left * scale,
          top: r.top + top * scale,
          width: r.width - (left + right) * scale,
          height: r.height - (top + bottom) * scale,
        },
        after: afterEl.getBoundingClientRect().top,
      });
      requestAnimationFrame(beforePaint);
    };
    // Read from a resize observer made after the hook's, so it runs after
    // the hook's own observer has had its say and before the frame is
    // painted. A rAF callback runs too early; a task after paint can land
    // after the next React commit.
    const beforePaint = () => {
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        tick();
      });
      observer.observe(document.body);
    };
    requestAnimationFrame(beforePaint);
  });
}

async function stopSampling(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const samples = window.__samples ?? [];
    window.__samples = null;
    return samples;
  });
}

/** Every edge of every drawn frame lies between where it was in the slot and the viewport's edge. */
function expectCarried(
  samples: Sample[],
  inline: Box,
  viewport: { width: number; height: number },
  after: number,
) {
  // Only that the sampler ran: a slow runner paints few frames.
  expect(samples.length).toBeGreaterThanOrEqual(2);
  const areas: number[] = [];
  const between = (value: number, a: number, b: number) =>
    value >= Math.min(a, b) - 1 && value <= Math.max(a, b) + 1;
  for (const [i, { frame: drawn, after: a }] of samples.entries()) {
    // Only what is on screen: moving and clipping at once bulges the edge a
    // few pixels past the viewport while the frame is scaled up.
    const left = Math.max(drawn.left, 0);
    const top = Math.max(drawn.top, 0);
    const f = {
      left,
      top,
      width: Math.min(drawn.left + drawn.width, viewport.width) - left,
      height: Math.min(drawn.top + drawn.height, viewport.height) - top,
    };
    areas.push(Math.max(f.width, 0) * Math.max(f.height, 0));
    expect(
      {
        left: between(f.left, Math.max(inline.left, 0), 0),
        top: between(f.top, Math.max(inline.top, 0), 0),
        right: between(
          f.left + f.width,
          Math.min(inline.left + inline.width, viewport.width),
          viewport.width,
        ),
        bottom: between(
          f.top + f.height,
          Math.min(inline.top + inline.height, viewport.height),
          viewport.height,
        ),
        // Where the opaque frame covers the whole viewport, no page is drawn.
        page:
          Math.abs(a - after) <= 1 ||
          (f.left <= 0 && f.top <= 0 && f.width >= viewport.width && f.height >= viewport.height),
      },
      `sample ${i} of ${samples.length}: ${JSON.stringify({ f, a })}`,
    ).toEqual({ left: true, top: true, right: true, bottom: true, page: true });
  }
  // One way up, then one way down: a frame that snaps back to the full
  // viewport at the end of the exit would sit inside the bounds above.
  const tolerance = viewport.width * viewport.height * 0.01;
  const peak = areas.indexOf(Math.max(...areas));
  for (let i = 1; i < areas.length; i++) {
    const step = areas[i] - areas[i - 1];
    const wrongWay = i <= peak ? step < -tolerance : step > tolerance;
    expect(wrongWay, `area ${i} of ${areas.length}: ${areas[i - 1]} -> ${areas[i]}`).toBe(false);
  }
}

async function enter(page: Page) {
  await fullscreenButton(page).click();
}

async function settlesAt(page: Page, box: Box) {
  await expect
    .poll(async () => {
      const drawn = await visibleFrame(page);
      return (["left", "top", "width", "height"] as const).every(
        (key) => Math.abs(drawn[key] - box[key]) <= 1,
      );
    })
    .toBe(true);
  await expect(frame(page)).not.toHaveAttribute("data-fullscreen-moving", /.*/);
}

/**
 * Freezes the carry halfway: the animations the frame is running are held
 * at half their duration, and the ones started next run freely.
 */
async function freezeHalfway(page: Page) {
  await page.evaluate(() => {
    const frameEl = document.querySelector("#player [data-testid='player-frame']")!;
    for (const a of frameEl.getAnimations()) {
      a.pause();
      a.currentTime = Number(a.effect?.getTiming().duration) / 2;
    }
    window.__holdAnimations = false;
  });
}

/** How much of the viewport the drawn frame covers. */
function area(s: Sample, viewport: { width: number; height: number }): number {
  const f = s.frame;
  const width = Math.min(f.left + f.width, viewport.width) - Math.max(f.left, 0);
  const height = Math.min(f.top + f.height, viewport.height) - Math.max(f.top, 0);
  return Math.max(width, 0) * Math.max(height, 0);
}

/** Marks the sample the next action starts from, then clicks the toggle past the shield. */
async function markAnd(page: Page, action: "escape" | "toggle") {
  await page.evaluate(() => {
    window.__markAt = window.__samples!.length;
  });
  if (action === "escape") {
    await page.keyboard.press("Escape");
    return;
  }
  // The shield takes every tap while the frame moves; the toggle is reached
  // the way a keyboard shortcut reaches it.
  await frame(page).evaluate((el) => {
    const button = Array.from(el.querySelectorAll("button")).find((b) =>
      /full screen/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
    );
    button!.click();
  });
}

for (const { id, sibling } of ARRANGEMENTS) {
  for (const orientation of ORIENTATIONS) {
    test.describe(`${id}, ${orientation.name}`, () => {
      test("the first frame of the entry is drawn over the inline slot, and only the picture is reachable", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await reachButton(page);
        const inline = await rectOf(page, "#player [data-testid='player-frame']");
        await page.evaluate(() => {
          window.__holdAnimations = true;
        });
        await enter(page);
        await expect(frame(page)).toHaveAttribute("data-fullscreen-moving", "true");

        expectSameBox(await visibleFrame(page), inline);

        const visible = await visibleFrame(page);
        const probe = await frame(page).evaluate(
          (el, [x, y]) => ({
            hitIsFrame: document.elementFromPoint(x, y) === el,
            chrome: Array.from(el.querySelectorAll("[data-player-chrome]")).map(
              (c) => getComputedStyle(c).opacity,
            ),
          }),
          // The middle of what is on screen: in landscape the slot runs off
          // the top of the viewport.
          [
            visible.left + visible.width / 2,
            (Math.max(visible.top, 0) +
              Math.min(visible.top + visible.height, orientation.height)) /
              2,
          ] as const,
        );
        expect(probe).toEqual({ hitIsFrame: true, chrome: probe.chrome.map(() => "0") });
        expect(probe.chrome.length).toBeGreaterThan(0);
      });

      test("the entry settles over the whole viewport, and the exit lands back on the slot", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await reachButton(page);
        const inline = await rectOf(page, "#player [data-testid='player-frame']");
        const after = await rectOf(page, "#after-player");
        const row = sibling ? await rectOf(page, sibling) : null;

        await startSampling(page);
        await enter(page);
        await settlesAt(page, {
          left: 0,
          top: 0,
          width: orientation.width,
          height: orientation.height,
        });
        const hits = await frame(page).evaluate((el, vp) => {
          const points = {
            header: [vp.width / 2, 20],
            centre: [vp.width / 2, vp.height / 2],
            bottom: [vp.width / 2, vp.height - 4],
          } as const;
          return Object.fromEntries(
            Object.entries(points).map(([name, [x, y]]) => {
              const hit = document.elementFromPoint(x, y);
              // Named when it misses, so a failure says what took the point.
              return [name, el.contains(hit) || `${hit?.tagName}#${hit?.id}.${hit?.className}`];
            }),
          );
        }, orientation);
        expect(hits).toEqual({ header: true, centre: true, bottom: true });
        expect((await rectOf(page, "#after-player")).top).toBeCloseTo(after.top, 0);
        if (sibling && row) expect((await rectOf(page, sibling)).top).toBeCloseTo(row.top, 0);

        await page.keyboard.press("Escape");
        await expect(frame(page)).not.toHaveAttribute("data-pseudo-fullscreen", /.*/);
        await settlesAt(page, inline);
        expectCarried(await stopSampling(page), inline, orientation, after.top);

        expect(await page.locator("html").getAttribute("data-player-fullscreen")).toBeNull();
        expect((await rectOf(page, "#after-player")).top).toBeCloseTo(after.top, 0);
        if (sibling && row) expect((await rectOf(page, sibling)).top).toBeCloseTo(row.top, 0);
      });

      test("an exit that cuts an entry short shrinks from where the frame is drawn", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await reachButton(page);
        await page.evaluate(() => {
          window.__holdAnimations = true;
        });
        await enter(page);
        await expect(frame(page)).toHaveAttribute("data-fullscreen-moving", "true");
        await freezeHalfway(page);
        await startSampling(page);
        await expect.poll(() => page.evaluate(() => window.__samples!.length)).toBeGreaterThan(2);
        await markAnd(page, "escape");
        await expect(frame(page)).not.toHaveAttribute("data-fullscreen-moving", /.*/);
        const samples = await stopSampling(page);
        const from = await page.evaluate(() => window.__markAt);

        const areas = samples.slice(Math.max(from - 1, 0)).map((x) => area(x, orientation));
        for (let i = 1; i < areas.length; i++) {
          expect(areas[i], `area ${i}: ${areas[i - 1]} -> ${areas[i]}`).toBeLessThanOrEqual(
            areas[i - 1] + 1,
          );
        }
      });

      test("a second press during an exit grows back from where the frame is drawn", async ({
        page,
      }) => {
        await arrange(page, id, orientation);
        await enter(page);
        await settlesAt(page, {
          left: 0,
          top: 0,
          width: orientation.width,
          height: orientation.height,
        });
        await page.evaluate(() => {
          window.__holdAnimations = true;
        });
        await page.keyboard.press("Escape");
        await expect(frame(page)).toHaveAttribute("data-fullscreen-moving", "true");
        await freezeHalfway(page);
        await startSampling(page);
        await expect.poll(() => page.evaluate(() => window.__samples!.length)).toBeGreaterThan(2);
        const halfway = area(
          (await page.evaluate(() => window.__samples!.at(-1)!)) as Sample,
          orientation,
        );
        await markAnd(page, "toggle");
        await settlesAt(page, {
          left: 0,
          top: 0,
          width: orientation.width,
          height: orientation.height,
        });
        const samples = await stopSampling(page);
        const from = await page.evaluate(() => window.__markAt);

        const full = orientation.width * orientation.height;
        const after = samples.slice(from).map((x) => area(x, orientation));
        const firstMove = after.find((a) => Math.abs(a - halfway) > 1)!;
        expect(halfway).toBeLessThan(full * 0.9);
        // Carried on from the halfway frame, not restarted from the full viewport.
        expect(firstMove).toBeLessThan(full * 0.99);
        for (let i = 1; i < after.length; i++) {
          expect(after[i], `area ${i}: ${after[i - 1]} -> ${after[i]}`).toBeGreaterThanOrEqual(
            after[i - 1] - 1,
          );
        }
      });

      test("reduced motion pins and unpins at once, never animates, and never moves the page", async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await arrange(page, id, orientation);
        await reachButton(page);
        const inline = await rectOf(page, "#player [data-testid='player-frame']");
        const after = await rectOf(page, "#after-player");
        const viewport = { left: 0, top: 0, width: orientation.width, height: orientation.height };

        await startSampling(page);
        await enter(page);
        await expect(frame(page)).toHaveAttribute("data-pseudo-fullscreen", "true");
        await settlesAt(page, viewport);
        // Under the opaque frame the samples cannot see the slot; the layout can.
        expect((await rectOf(page, "#after-player")).top).toBeCloseTo(after.top, 0);
        await page.keyboard.press("Escape");
        await expect(frame(page)).not.toHaveAttribute("data-pseudo-fullscreen", /.*/);
        await settlesAt(page, inline);

        expectCarried(await stopSampling(page), inline, orientation, after.top);
        expect(await page.evaluate(() => window.__animations.length)).toBe(0);
      });
    });
  }
}
