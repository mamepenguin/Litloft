/**
 * The justified grid holding back its last line while more pages may follow.
 * jsdom lays nothing out, so lines, boxes, paint and focus are only real here.
 *
 * Every harness mutation commits under `flushSync`. A read straight after it
 * sees what the commit and its layout effects left; a read in the second
 * animation frame after it sees what the first frame painted, after any
 * ResizeObserver callback of that frame.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

let run = 0;

interface Cell {
  key: string;
  top: number;
  left: number;
  w: number;
  h: number;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  vis: string;
  op: number;
  inlineT: string;
  compT: string;
}

interface Snap {
  gridH: number;
  cells: Cell[];
}

function probe(): void {
  const w = window as unknown as Record<string, unknown>;
  const round = (n: number) => Math.round(n * 100) / 100;
  const cells = () =>
    [...document.querySelectorAll<HTMLElement>(".justified-grid-cell")];
  const snap = () => {
    const grid = document.querySelector<HTMLElement>(".justified-grid");
    if (!grid) return { gridH: 0, cells: [] };
    const g = grid.getBoundingClientRect();
    return {
      gridH: grid.offsetHeight,
      cells: cells().map((c) => {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return {
          key: c.getAttribute("data-flip-key")!,
          top: c.offsetTop,
          left: c.offsetLeft,
          w: c.offsetWidth,
          h: c.offsetHeight,
          rx: round(r.left - g.left),
          ry: round(r.top - g.top),
          rw: round(r.width),
          rh: round(r.height),
          vis: cs.visibility,
          op: Number(cs.opacity),
          inlineT: c.style.transform,
          compT: cs.transform,
        };
      }),
    };
  };
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  w.__probe = {
    snap,
    frame,
    painted: async () => {
      await frame();
      await frame();
      return snap();
    },
    /** One snapshot per animation frame for `ms` after the call. */
    frames: async (ms: number) => {
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await frame();
        out.push({ t: performance.now() - t0, s: snap() });
      }
      return out;
    },
  };
}

type Probe = {
  snap(): Snap;
  frame(): Promise<void>;
  painted(): Promise<Snap>;
  frames(ms: number): Promise<{ t: number; s: Snap }[]>;
};

async function open(
  page: Page,
  query: { n?: number; width?: number; more?: "1" | "0" | "omit"; kind?: string } = {},
): Promise<void> {
  await page.addInitScript(probe);
  const q = new URLSearchParams({
    run: String(++run),
    n: String(query.n ?? 40),
    width: String(query.width ?? 900),
    more: query.more ?? "1",
    kind: query.kind ?? "photo",
  });
  await page.goto(`${FIXTURE}?${q}#justified-hold`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
  await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.painted());
}

const lastLine = (s: Snap): string[] => {
  const top = s.cells[s.cells.length - 1].top;
  return s.cells.filter((c) => Math.abs(c.top - top) < 1).map((c) => c.key);
};
const lineCount = (s: Snap): number =>
  new Set(s.cells.map((c) => Math.round(c.top))).size;
const held = (s: Snap): string[] =>
  s.cells.filter((c) => c.vis === "hidden").map((c) => c.key);
const byKey = (s: Snap) => new Map(s.cells.map((c) => [c.key, c]));

function expectHoldIsLastLine(s: Snap, label: string): void {
  expect(lineCount(s), `${label}: grid has two or more lines`).toBeGreaterThanOrEqual(2);
  expect(held(s), `${label}: held set`).toEqual(lastLine(s));
}

function expectSameRect(a: Cell, b: Cell, label: string): void {
  for (const k of ["rx", "ry", "rw", "rh"] as const) {
    expect(Math.abs(a[k] - b[k]), `${label} ${k} ${a[k]} vs ${b[k]}`).toBeLessThanOrEqual(0.5);
  }
}

test.describe("SPEC-CORE-002 the hold", () => {
  test("SPEC-CORE-002 I1: with more to follow, exactly the last line is held and the rest painted", async ({ page }) => {
    await open(page);
    const s = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.snap());
    expectHoldIsLastLine(s, "first layout");
    for (const c of s.cells) {
      if (!lastLine(s).includes(c.key)) expect(c.vis, c.key).toBe("visible");
    }
  });

  test("SPEC-CORE-002 I3: holding moves no box and keeps the grid's height", async ({ page }) => {
    await open(page, { more: "0" });
    const { unheld, holding } = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { setMore(m: boolean): void } };
      const unheld = w.__probe.snap();
      w.__jg.setMore(true);
      const holding = await w.__probe.painted();
      return { unheld, holding };
    });
    expectHoldIsLastLine(holding, "after more turned true");
    expect(holding.gridH).toBe(unheld.gridH);
    const before = byKey(unheld);
    for (const c of holding.cells) {
      const b = before.get(c.key)!;
      expect([c.top, c.left, c.w, c.h], c.key).toEqual([b.top, b.left, b.w, b.h]);
    }
  });

  test("SPEC-CORE-002 I6: more may follow turning false releases every cell at once, unfaded, in place", async ({ page }) => {
    await open(page);
    const { before, frames } = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { setMore(m: boolean): void } };
      const before = w.__probe.snap();
      w.__jg.setMore(false);
      const frames = await w.__probe.frames(300);
      return { before, frames };
    });
    const released = held(before);
    expect(released.length, "something was held before").toBeGreaterThan(0);
    const final = byKey(frames[frames.length - 1].s);
    for (const { s } of frames.slice(1)) {
      expect(held(s)).toEqual([]);
      for (const key of released) {
        const c = byKey(s).get(key)!;
        expect(c.op, `${key} opacity`).toBe(1);
        expectSameRect(c, final.get(key)!, key);
      }
    }
  });

  test("SPEC-CORE-002 I6: a caller that does not pass more-may-follow holds nothing", async ({ page }) => {
    await open(page, { more: "omit" });
    const s = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.snap());
    expect(lineCount(s)).toBeGreaterThanOrEqual(2);
    expect(held(s)).toEqual([]);
  });

  test("SPEC-CORE-002 I6: the card grid holds nothing", async ({ page }) => {
    await open(page, { kind: "video", more: "1" });
    const hidden = await page.evaluate(() => {
      const host = document.getElementById("jg-host")!;
      if (host.querySelector(".justified-grid")) return ["justified grid rendered for videos"];
      return [...host.querySelectorAll<HTMLElement>("*")]
        .filter((el) => getComputedStyle(el).visibility === "hidden")
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(hidden).toEqual([]);
  });

  test("SPEC-CORE-002 I7: a grid that falls to one line releases its held line", async ({ page }) => {
    await open(page, { n: 3, width: 240 });
    const { narrow, wide } = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { setWidth(px: number): void } };
      const narrow = w.__probe.snap();
      w.__jg.setWidth(1200);
      const wide = await w.__probe.painted();
      return { narrow, wide };
    });
    expectHoldIsLastLine(narrow, "narrow");
    expect(lineCount(wide), "three photographs fit one 1200px line").toBe(1);
    expect(held(wide)).toEqual([]);
  });
});

test.describe("SPEC-CORE-002 held cells take no input", () => {
  test("SPEC-CORE-002 I2: Tab skips held cells and reaches the painted ones", async ({ page }) => {
    await open(page, { n: 12, width: 700 });
    const s = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.snap());
    expectHoldIsLastLine(s, "start");

    await page.focus("#before-grid");
    const reached = new Set<string>();
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (a?.id === "after-grid") return "after";
        return a?.closest(".justified-grid-cell")?.getAttribute("data-flip-key") ?? null;
      });
      if (where === "after") break;
      if (where) reached.add(where);
    }
    const heldKeys = held(s);
    const shown = s.cells.map((c) => c.key).filter((k) => !heldKeys.includes(k));
    expect([...reached].sort()).toEqual([...shown].sort());
  });

  test("SPEC-CORE-002 I2: a click, Enter or Space on a held cell neither opens nor selects it", async ({ page }) => {
    await open(page, { n: 12, width: 700 });
    const s = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.snap());
    expectHoldIsLastLine(s, "start");
    const heldKey = held(s)[0];
    const shownKey = s.cells[0].key;
    const href = page.url();

    const centre = async (key: string) =>
      page.evaluate((k) => {
        const cell = document.querySelector(`[data-flip-key="${k}"]`)!;
        const target = cell.querySelector('[role="button"]') ?? cell;
        const r = target.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, key);

    const h = await centre(heldKey);
    await page.mouse.click(h.x, h.y);
    await page.evaluate((k) => {
      const cell = document.querySelector(`[data-flip-key="${k}"]`)!;
      (cell.querySelector<HTMLElement>('[role="button"]') ?? (cell as HTMLElement)).focus();
    }, heldKey);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.__jg.log.slice())).toEqual([]);
    expect(page.url()).toBe(href);

    // The same gesture on a painted cell does act, so the silence above is
    // the hold and not a harness that records nothing.
    const v = await centre(shownKey);
    await page.mouse.click(v.x, v.y);
    expect(await page.evaluate(() => window.__jg.log.slice())).toContain(`select:${shownKey}`);
  });

  test("SPEC-CORE-002 I2: focus on a cell that becomes held moves to the nearest painted cell before it", async ({ page }) => {
    await open(page, { n: 12, width: 700, more: "0" });
    const result = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { setMore(m: boolean): void } };
      const all = [...document.querySelectorAll<HTMLElement>(".justified-grid-cell")];
      const last = all[all.length - 1];
      (last.querySelector<HTMLElement>('[role="button"]') ?? last).focus();
      const focusedBefore = document.activeElement?.closest(".justified-grid-cell")?.getAttribute("data-flip-key");
      w.__jg.setMore(true);
      const s = await w.__probe.painted();
      const focusedAfter = document.activeElement?.closest(".justified-grid-cell")?.getAttribute("data-flip-key") ?? null;
      return { s, focusedBefore, focusedAfter };
    });
    expectHoldIsLastLine(result.s, "after more turned true");
    expect(result.focusedBefore).toBe(result.s.cells[result.s.cells.length - 1].key);
    const firstHeld = result.s.cells.findIndex((c) => c.vis === "hidden");
    expect(result.focusedAfter).toBe(result.s.cells[firstHeld - 1].key);
  });
});

test.describe("SPEC-CORE-002 an append under the hold", () => {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`SPEC-CORE-002 I4/I5 (${motion}): painted cells stay put; the held line appears in place${motion === "reduce" ? " at once" : " with a fade"}; the new last line is held`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await open(page);
      const { before, committed, frames } = await page.evaluate(async () => {
        const w = window as unknown as { __probe: Probe; __jg: { append(n: number): void } };
        const before = w.__probe.snap();
        w.__jg.append(20);
        const committed = w.__probe.snap();
        const frames = await w.__probe.frames(400);
        return { before, committed, frames };
      });

      const wasHeld = held(before);
      expect(wasHeld.length, "a line was held before the append").toBeGreaterThan(0);
      const wasPainted = before.cells.map((c) => c.key).filter((k) => !wasHeld.includes(k));
      const beforeBy = byKey(before);
      const painted = frames.slice(1);
      const final = byKey(frames[frames.length - 1].s);

      expectHoldIsLastLine(committed, "on the appending commit");
      expectHoldIsLastLine(frames[frames.length - 1].s, "after the append settles");

      for (const { s } of painted) {
        const now = byKey(s);
        for (const key of wasPainted) {
          const c = now.get(key)!;
          expectSameRect(c, beforeBy.get(key)!, `painted ${key}`);
          expect(c.inlineT, `${key} inline transform`).toBe("");
        }
        for (const key of wasHeld) {
          const c = now.get(key)!;
          expect(c.vis, `${key} released`).toBe("visible");
          expect(c.compT, `${key} transform`).toBe("none");
          expectSameRect(c, final.get(key)!, `released ${key}`);
        }
      }

      const firstOpacity = byKey(painted[0].s).get(wasHeld[0])!.op;
      if (motion === "reduce") {
        expect(firstOpacity).toBe(1);
      } else {
        expect(firstOpacity).toBeLessThan(1);
        const late = painted.find(({ t }) => t >= 300)!;
        expect(byKey(late.s).get(wasHeld[0])!.op).toBe(1);
      }
    });
  }
});

test.describe("SPEC-CORE-002 the held set follows the layout", () => {
  test("SPEC-CORE-002 I8: after a width change the held set is the new last line in the first painted frame", async ({ page }) => {
    await open(page, { width: 900 });
    const s = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { setWidth(px: number): void } };
      w.__jg.setWidth(560);
      return w.__probe.painted();
    });
    expectHoldIsLastLine(s, "after narrowing");
  });

  test("SPEC-CORE-002 I8/I5: a removal re-decides the hold, and a released cell appears unfaded at its final box", async ({ page }) => {
    await open(page);
    const { before, frames } = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { remove(id: string): void } };
      const before = w.__probe.snap();
      w.__jg.remove(before.cells[0].key);
      const frames = await w.__probe.frames(400);
      return { before, frames };
    });
    const painted = frames.slice(1);
    expectHoldIsLastLine(painted[0].s, "first painted frame after removal");
    expectHoldIsLastLine(frames[frames.length - 1].s, "after removal settles");
    const final = byKey(frames[frames.length - 1].s);
    const released = held(before).filter((k) => !held(painted[0].s).includes(k));
    for (const { s } of painted) {
      for (const key of released) {
        const c = byKey(s).get(key)!;
        if (c.vis !== "visible") continue;
        expect(c.op, `${key} opacity`).toBe(1);
        expectSameRect(c, final.get(key)!, `released ${key}`);
      }
    }
  });

  test("SPEC-CORE-002 I8: a reorder re-decides the hold before the first paint", async ({ page }) => {
    await open(page);
    const s = await page.evaluate(async () => {
      const w = window as unknown as { __probe: Probe; __jg: { reverse(): void } };
      w.__jg.reverse();
      return w.__probe.painted();
    });
    expectHoldIsLastLine(s, "after reverse");
  });

  test("SPEC-CORE-002 I8: a row replaced with a new ratio re-decides the hold before the first paint", async ({ page }) => {
    await open(page);
    const { before, s } = await page.evaluate(async () => {
      const w = window as unknown as {
        __probe: Probe;
        __jg: { setDims(id: string, w: number, h: number): void };
      };
      const before = w.__probe.snap();
      const lastOf = (snap: Snap) => {
        const top = snap.cells[snap.cells.length - 1].top;
        return snap.cells.filter((c) => Math.abs(c.top - top) < 1).map((c) => c.key);
      };
      const tail = lastOf(before);
      const lineAbove = before.cells.filter(
        (c) => c.top < before.cells[before.cells.length - 1].top - 1,
      );
      // Ratio replacements tried in turn until one moves the last line's
      // first edge; which one does depends on the packer's target height.
      const candidates: [string, number, number][] = [
        [tail[0], 1000, 4000],
        [lineAbove[lineAbove.length - 1].key, 9000, 3000],
        [tail[0], 9000, 3000],
        [before.cells[0].key, 1000, 4000],
      ];
      for (const [id, dw, dh] of candidates) {
        w.__jg.setDims(id, dw, dh);
        if (lastOf(w.__probe.snap()).join() !== tail.join()) break;
      }
      return { before, s: await w.__probe.painted() };
    });
    expect(lastLine(s), "the new ratio changed the last line").not.toEqual(lastLine(before));
    expectHoldIsLastLine(s, "after ratio change");
  });

  test("SPEC-CORE-002 I8: the hold is read from layout boxes while a FLIP is still in flight", async ({ page }) => {
    await open(page, { more: "0" });
    const s = await page.evaluate(async () => {
      const w = window as unknown as {
        __probe: Probe;
        __jg: { remove(id: string): void; setMore(m: boolean): void };
      };
      const first = w.__probe.snap().cells[0].key;
      w.__jg.remove(first);
      await w.__probe.frame();
      await w.__probe.frame();
      w.__jg.setMore(true);
      return w.__probe.painted();
    });
    expectHoldIsLastLine(s, "set during the removal's FLIP");
  });

  test("SPEC-CORE-002 I9: a held cell stays unpainted across a selection change and an unrelated re-render", async ({ page }) => {
    await open(page);
    const { start, afterSelect, afterRerender } = await page.evaluate(async () => {
      const w = window as unknown as {
        __probe: Probe;
        __jg: { select(id: string): void; rerender(): void };
      };
      const start = w.__probe.snap();
      w.__jg.select(start.cells[0].key);
      const afterSelect = await w.__probe.painted();
      w.__jg.rerender();
      const afterRerender = await w.__probe.painted();
      return { start, afterSelect, afterRerender };
    });
    expectHoldIsLastLine(start, "start");
    expect(held(afterSelect)).toEqual(held(start));
    expect(held(afterRerender)).toEqual(held(start));
  });
});
