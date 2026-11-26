/**
 * SPEC-CORE-182 — toasts measured on screen, frame by frame, in a real
 * browser: a dismissed toast fades where it stands, the toasts that stay
 * travel instead of jumping, and a leaving toast takes no press.
 *
 * Every push, dismissal and frame sample happens inside the page, so the
 * frame before a change and the frames after it are read in the same run of
 * the event loop as the change itself.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

/** One frame at 60Hz: what a sample time can be late by. */
const FRAME_MS = 17;

let navigation = 0;

interface Box {
  top: number;
  opacity: number;
}

type Frame = { t: number; m: Record<string, Box | null> };

declare global {
  interface Window {
    __measure: (message: string) => Box | null;
    __frame: () => Promise<number>;
    __frames: (messages: string[], ms: number, during?: (t: number) => void) => Promise<Frame[]>;
    __closeOf: (message: string) => HTMLElement;
    __settle: (ms: number) => Promise<void>;
    __runs: Record<string, number>;
  }
}

function helpers(): void {
  const textNode = (message: string): Text | null => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue === message) return node as Text;
    }
    return null;
  };

  /** Where the message is drawn, transforms included, and how opaque it is drawn. */
  window.__measure = (message) => {
    const node = textNode(message);
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    let opacity = 1;
    for (let el = node.parentElement; el; el = el.parentElement) {
      opacity *= Number(getComputedStyle(el).opacity);
    }
    return { top: range.getBoundingClientRect().top, opacity };
  };

  window.__frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));

  window.__frames = async (messages, ms, during) => {
    const start = performance.now();
    const out: Frame[] = [];
    while (performance.now() - start < ms) {
      await window.__frame();
      const t = performance.now() - start;
      out.push({ t, m: Object.fromEntries(messages.map((m) => [m, window.__measure(m)])) });
      during?.(t);
    }
    return out;
  };

  window.__closeOf = (message) => {
    let el = textNode(message)?.parentElement ?? null;
    while (el && el.querySelectorAll('[aria-label="Dismiss"]').length !== 1) {
      el = el.parentElement;
    }
    if (!el) throw new Error(`no close button around ${message}`);
    return el.querySelector('[aria-label="Dismiss"]') as HTMLElement;
  };

  window.__settle = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__runs = {};
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(helpers);
  await page.goto(`${FIXTURE}?run=${++navigation}#toast-stack`);
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", "toast-stack");
  await expect
    .poll(() => page.evaluate(() => typeof window.__toast?.info))
    .toBe("function");
}

/** Pushes each message and lets its entrance and the stack's travel finish. */
async function pushAtRest(page: Page, messages: string[]): Promise<void> {
  await page.evaluate(async (messages) => {
    for (const message of messages) {
      window.__toast!.info(message);
      await window.__settle(400);
    }
  }, messages);
}

function firstFrameWhere(frames: Frame[], test: (f: Frame) => boolean): number {
  const at = frames.findIndex(test);
  if (at === -1) throw new Error("the change never reached the screen");
  return at;
}

function expectSameTops(before: Frame["m"], after: Frame["m"], messages: string[]): void {
  for (const message of messages) {
    expect(before[message], `${message} before`).not.toBeNull();
    expect(after[message], `${message} after`).not.toBeNull();
    expect(Math.abs(after[message]!.top - before[message]!.top), message).toBeLessThanOrEqual(1);
  }
}

function expectAtRestFrom(frames: Frame[], from: number, messages: string[]): void {
  const last = frames[frames.length - 1].m;
  for (const frame of frames.filter((f) => f.t >= from)) {
    for (const message of messages) {
      expect(frame.m[message], `${message} at ${Math.round(frame.t)}ms`).not.toBeNull();
      expect(
        Math.abs(frame.m[message]!.top - last[message]!.top),
        `${message} at ${Math.round(frame.t)}ms`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

test.describe("SPEC-CORE-182 I10 one toast", () => {
  test("SPEC-CORE-182 I10 a leaving toast fades to 0 within 150ms where it stands, then is removed", async ({
    page,
  }) => {
    await open(page);
    await pushAtRest(page, ["Alpha"]);

    const { before, frames } = await page.evaluate(async () => {
      await window.__frame();
      const before = window.__measure("Alpha");
      window.__closeOf("Alpha").click();
      const frames = await window.__frames(["Alpha"], 400);
      return { before, frames };
    });

    expect(before).not.toBeNull();
    expect(before!.opacity).toBe(1);
    expect(frames[0].m.Alpha, "still drawn in the first frame after the dismissal").not.toBeNull();
    expect(frames[0].m.Alpha!.opacity).toBeGreaterThan(0.5);
    for (const { t, m } of frames) {
      const box = m.Alpha;
      if (!box) continue;
      expect(Math.abs(box.top - before!.top), `top at ${Math.round(t)}ms`).toBeLessThanOrEqual(1);
      if (t >= 100) expect(box.opacity, `opacity at ${Math.round(t)}ms`).toBeLessThan(0.5);
      if (t >= 150 + FRAME_MS) expect(box.opacity, `opacity at ${Math.round(t)}ms`).toBeLessThan(0.05);
    }
    expect(frames[frames.length - 1].m.Alpha, "removed after its leave").toBeNull();
  });

  test("SPEC-CORE-182 I10 an entering toast starts transparent 8px low and is in place within 200ms", async ({
    page,
  }) => {
    await open(page);

    const frames = await page.evaluate(async () => {
      await window.__frame();
      window.__toast!.info("Beta");
      return window.__frames(["Beta"], 400);
    });

    const shown = frames.filter((f) => f.m.Beta);
    const rest = frames[frames.length - 1].m.Beta!;
    const first = shown[0].m.Beta!;
    expect(first.opacity).toBeLessThan(0.3);
    expect(first.top - rest.top).toBeGreaterThanOrEqual(5);
    expect(first.top - rest.top).toBeLessThanOrEqual(8 + 1);
    for (const { t, m } of shown.filter((f) => f.t >= 200 + FRAME_MS)) {
      expect(m.Beta!.opacity, `opacity at ${Math.round(t)}ms`).toBeGreaterThan(0.99);
      expect(Math.abs(m.Beta!.top - rest.top), `top at ${Math.round(t)}ms`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("SPEC-CORE-182 I6 the stack travels", () => {
  test("SPEC-CORE-182 I6 a push leaves every other toast where it was in the first frame, then rests within 250ms", async ({
    page,
  }) => {
    await open(page);
    await pushAtRest(page, ["A", "B", "C"]);

    const frames = await page.evaluate(async () => {
      await window.__frame();
      const before = { t: 0, m: Object.fromEntries(["A", "B", "C", "D"].map((x) => [x, window.__measure(x)])) };
      window.__toast!.info("D");
      return [before, ...(await window.__frames(["A", "B", "C", "D"], 700))];
    });

    const k = firstFrameWhere(frames, (f) => f.m.D !== null);
    expectSameTops(frames[k - 1].m, frames[k].m, ["A", "B", "C"]);
    expectAtRestFrom(frames, frames[k].t + 250 + FRAME_MS, ["A", "B", "C", "D"]);
    const last = frames[frames.length - 1].m;
    expect(Math.abs(last.A!.top - frames[0].m.A!.top), "the stack moved").toBeGreaterThan(20);
  });

  test("SPEC-CORE-182 I6 a removal leaves every other toast where it was in the first frame, then rests within 250ms", async ({
    page,
  }) => {
    await open(page);
    await pushAtRest(page, ["A", "B", "C"]);

    const frames = await page.evaluate(async () => {
      await window.__frame();
      const before = { t: 0, m: Object.fromEntries(["A", "B", "C"].map((x) => [x, window.__measure(x)])) };
      window.__closeOf("B").click();
      return [before, ...(await window.__frames(["A", "B", "C"], 800))];
    });

    const k = firstFrameWhere(frames, (f) => f.m.B === null);
    expect(k, "B stays on screen while it leaves").toBeGreaterThan(1);
    expectSameTops(frames[k - 1].m, frames[k].m, ["A", "C"]);
    expectAtRestFrom(frames, frames[k].t + 250 + FRAME_MS, ["A", "C"]);
    const last = frames[frames.length - 1].m;
    const moved = Math.max(
      Math.abs(last.A!.top - frames[0].m.A!.top),
      Math.abs(last.C!.top - frames[0].m.C!.top),
    );
    expect(moved, "the stack closed the gap").toBeGreaterThan(20);
  });

  test("SPEC-CORE-182 I6 a removal during a running travel starts from where each toast is drawn", async ({
    page,
  }) => {
    await open(page);
    await pushAtRest(page, ["A", "B", "C", "D"]);

    const frames = await page.evaluate(async () => {
      await window.__frame();
      const names = ["A", "B", "C", "D"];
      const before = { t: 0, m: Object.fromEntries(names.map((x) => [x, window.__measure(x)])) };
      window.__closeOf("B").click();
      let closedC = false;
      const rest = await window.__frames(names, 900, (t) => {
        if (!closedC && t >= 80) {
          closedC = true;
          window.__closeOf("C").click();
        }
      });
      return [before, ...rest];
    });

    const kB = firstFrameWhere(frames, (f) => f.m.B === null);
    const kC = firstFrameWhere(frames, (f) => f.m.C === null);
    expect(kC, "C is removed after B").toBeGreaterThan(kB);
    expectSameTops(frames[kB - 1].m, frames[kB].m, ["A", "C", "D"]);
    expectSameTops(frames[kC - 1].m, frames[kC].m, ["A", "D"]);

    const startA = frames[0].m.A!.top;
    const finalA = frames[frames.length - 1].m.A!.top;
    const midA = frames[kC - 1].m.A!.top;
    expect(Math.abs(midA - startA), "A had started its first travel").toBeGreaterThan(2);
    expect(Math.abs(midA - finalA), "A had not finished travelling").toBeGreaterThan(2);
    expectAtRestFrom(frames, frames[kC].t + 250 + FRAME_MS, ["A", "D"]);
  });
});

test.describe("SPEC-CORE-182 I7 without Element.animate", () => {
  test("SPEC-CORE-182 I7 a toast still leaves, and the rest land at once and throw nothing", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });
    await open(page);
    expect(await page.evaluate(() => typeof Element.prototype.animate)).toBe("undefined");
    await pushAtRest(page, ["A", "B", "C"]);

    const removal = await page.evaluate(async () => {
      await window.__frame();
      window.__closeOf("B").click();
      return window.__frames(["A", "B", "C"], 600);
    });
    expect(removal[0].m.B, "B stays on screen while it leaves").not.toBeNull();
    const kB = firstFrameWhere(removal, (f) => f.m.B === null);
    expectSameTops(removal[kB].m, removal[removal.length - 1].m, ["A", "C"]);

    const push = await page.evaluate(async () => {
      await window.__frame();
      window.__toast!.info("D");
      return window.__frames(["A", "C", "D"], 600);
    });
    const kD = firstFrameWhere(push, (f) => f.m.D !== null);
    expectSameTops(push[kD].m, push[push.length - 1].m, ["A", "C"]);

    expect(errors).toEqual([]);
  });
});

test.describe("SPEC-CORE-182 I5 I8 a leaving toast takes no press", () => {
  test("SPEC-CORE-182 I8 a second pointer press on the action during the leave runs nothing", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await page.evaluate(() => {
      window.__toast!.success("Moved", {
        action: { label: "Undo", onClick: () => (window.__runs.undo = (window.__runs.undo ?? 0) + 1) },
      });
    });
    const undo = page.getByRole("button", { name: "Undo" });
    const box = (await undo.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.click(at.x, at.y);
    expect(await page.evaluate(() => window.__runs.undo)).toBe(1);
    const leaving = await page.evaluate(() => {
      const undo = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Undo",
      );
      return {
        present: undo !== undefined,
        inert: undo?.closest("[inert]") != null,
        hidden: undo?.closest('[aria-hidden="true"]') != null,
      };
    });
    expect(leaving).toEqual({ present: true, inert: true, hidden: true });

    await page.mouse.click(at.x, at.y);
    expect(await page.evaluate(() => window.__runs.undo)).toBe(1);
  });

  test("SPEC-CORE-182 I5 I8 the keyboard cannot reach the action during the leave, and focus is on body", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page);
    await page.evaluate(() => {
      window.__toast!.success("Moved", {
        action: { label: "Undo", onClick: () => (window.__runs.undo = (window.__runs.undo ?? 0) + 1) },
      });
    });
    await page.getByRole("button", { name: "Undo" }).focus();

    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__runs.undo)).toBe(1);
    const state = await page.evaluate(() => ({
      present: window.__measure("Moved") !== null,
      onBody: document.activeElement === document.body,
    }));
    expect(state).toEqual({ present: true, onBody: true });

    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    const refocused = await page.evaluate(() => {
      const undo = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Undo",
      )!;
      undo.focus();
      return document.activeElement === undo;
    });
    expect(refocused).toBe(false);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__runs.undo)).toBe(1);
  });
});
