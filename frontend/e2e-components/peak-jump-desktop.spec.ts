/**
 * SPEC-CORE-151 D1, D3, I7: the jump button in the pointer layout, measured
 * in a real browser, and the label after a press.
 */

import { test, expect, type Page } from "@playwright/test";

import { JUMP, box, labelBox, openPeakJump } from "./peak-jump.serve";

interface RowControl {
  name: string;
  x: number;
  right: number;
  clipped: boolean;
}

/** The pointer row's buttons and its time display, left to right. */
function row(page: Page): Promise<{ frame: { x: number; right: number }; controls: RowControl[] }> {
  return page.evaluate(() => {
    const frame = document.querySelector("#player-frame")!.getBoundingClientRect();
    const bar = document.querySelector('[data-testid="control-bar"]');
    if (!bar) throw new Error("no pointer control bar");
    const isTime = (n: Element) =>
      /^\d+:\d\d(:\d\d)?\s*\/\s*5:55:20$/.test((n.textContent ?? "").replace(/\s+/g, " ").trim());
    const time = Array.from(bar.querySelectorAll<HTMLElement>("*")).find(
      (n) => isTime(n) && !Array.from(n.children).some(isTime),
    );
    const play = bar.querySelector<HTMLElement>('button[aria-label="Play"]');
    if (!play) throw new Error("no Play button in the row");
    const band = play.getBoundingClientRect();
    const onRow = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const middle = r.top + r.height / 2;
      return r.width > 0 && middle >= band.top && middle <= band.bottom;
    };
    const els: HTMLElement[] = [
      ...Array.from(bar.querySelectorAll<HTMLElement>("button, input, [role='slider']")).filter(
        onRow,
      ),
      ...(time ? [time] : []),
    ];
    const bounds = (el: HTMLElement) => {
      let r = el.getBoundingClientRect();
      let left = r.left;
      let right = r.right;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const style = getComputedStyle(n);
        if (style.overflowX !== "visible" || style.overflow !== "visible") {
          r = n.getBoundingClientRect();
          left = Math.max(left, r.left);
          right = Math.min(right, r.right);
        }
      }
      return { left, right };
    };
    return {
      frame: { x: frame.left, right: frame.right },
      controls: els
        .map((el) => {
          const r = el.getBoundingClientRect();
          const visible = bounds(el);
          const textClipped = el === time && el.scrollWidth > el.clientWidth + 0.5;
          return {
            name:
              el.getAttribute("aria-label") ??
              (el.tagName === "INPUT" ? `input:${(el as HTMLInputElement).type}` : null) ??
              (el.textContent ?? "").replace(/\s+/g, " ").trim(),
            x: r.left,
            right: r.right,
            clipped:
              textClipped ||
              r.width === 0 ||
              visible.left > r.left + 0.5 ||
              visible.right < r.right - 0.5,
          };
        })
        .sort((a, b) => a.x - b.x),
    };
  });
}

const ROWS: Array<[string, number]> = [
  ["at the start (0:00 of 5:55:20)", 0],
  // 5:33:20 of 5:55:20: both halves of the time display take hours.
  ["at 5:33:20 of 5:55:20", 20000],
];

for (const [when, time] of ROWS) {
  test(`SPEC-CORE-151 D1 I7 at 524px ${when} the button follows +10, carries its title, and no control of the row is clipped`, async ({
    page,
  }) => {
    await openPeakJump(page, 900, time);
    await page.locator("#player-frame").hover();
    const wide = await row(page);

    await openPeakJump(page, 524, time);
    await page.locator("#player-frame").hover();
    await expect(page.locator(JUMP)).toHaveCount(1);
    await expect(page.locator(JUMP)).toHaveAttribute("title", "Jump to most watched (P)");

    const { frame, controls } = await row(page);
    expect(controls.some((c) => /5:55:20$/.test(c.name)), "the time display is measured").toBe(true);

    const forward = controls.findIndex((c) => c.name === "Forward 10 seconds");
    expect(forward).toBeGreaterThanOrEqual(0);
    expect(controls[forward + 1]?.name).toBe("Jump to most watched");

    for (const c of controls) {
      expect(c.clipped, `${c.name} is clipped`).toBe(false);
      expect(c.x, `${c.name} starts inside the frame`).toBeGreaterThanOrEqual(frame.x - 0.5);
      expect(c.right, `${c.name} ends inside the frame`).toBeLessThanOrEqual(frame.right + 0.5);
    }
    for (let i = 1; i < controls.length; i++) {
      expect(
        controls[i].x,
        `${controls[i].name} overlaps ${controls[i - 1].name}`,
      ).toBeGreaterThanOrEqual(controls[i - 1].right - 0.5);
    }
    for (const c of wide.controls.filter((w) => w.name !== "Jump to most watched")) {
      const narrow = controls.find((n) => n.name === c.name);
      expect(narrow, `${c.name} is in the 524px row`).toBeDefined();
      expect(narrow!.right - narrow!.x, `${c.name} keeps its 900px width`).toBeGreaterThanOrEqual(
        c.right - c.x - 0.5,
      );
    }
  });
}

for (const width of [523, 480]) {
  test(`SPEC-CORE-151 I7 at ${width}px the pointer row has no jump button`, async ({ page }) => {
    await openPeakJump(page, width);
    await page.locator("#player-frame").hover();
    await expect(page.locator('[data-testid="control-bar"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Forward 10 seconds" })).toHaveCount(1);
    // The band has its spots by now: the 524px frame of the same page has the button.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(page.url().replace(`w=${width}`, "w=524"));
    await page.locator("#player-frame").hover();
    await expect(page.locator(JUMP)).toHaveCount(1);
    await page.goto(page.url().replace("w=524", `w=${width}`));
    await page.locator("#player-frame").hover();
    await expect(page.getByRole("button", { name: "Forward 10 seconds" })).toHaveCount(1);
    await expect(page.locator(JUMP)).toHaveCount(0);
  });
}

test("SPEC-CORE-151 D3 a press shows the label at the top centre of the frame", async ({ page }) => {
  await openPeakJump(page, 900);
  await page.locator("#player-frame").hover();
  await expect(page.locator(JUMP)).toHaveCount(1);
  await page.locator(JUMP).click();

  await expect.poll(async () => (await labelBox(page))?.text).toBe("Most watched 1 / 2");
  const label = (await labelBox(page))!;
  const frame = (await box(page, "#player-frame"))!;
  expect(Math.abs(label.x + label.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(2);
  expect(label.y - frame.y).toBeGreaterThanOrEqual(0);
  expect(label.y - frame.y).toBeLessThan(frame.height / 4);
});
