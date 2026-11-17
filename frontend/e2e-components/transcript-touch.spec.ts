/**
 * SPEC-ADDON-125 / SPEC-ADDON-126 at phone widths: the row actions and the
 * correction dialog, measured in a real browser with a coarse pointer.
 */

import { test, expect, devices, type Browser, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const ARRANGEMENT = "transcript-touch";

const TEXTS = [
  "今日は会議の議題を三つ確認してから、順番に進めていきます。",
  "まず先週の作業の振り返りですが、予定していた部分はほぼ終わりました。",
  "残っているのは画面のレイアウトの調整と、細かい文言の修正です。",
  "次に今週の予定です。新しい機能の設計を始めたいと考えています。",
  "設計については来週の水曜日までに案をまとめて共有します。",
];
const SECOND_START = 5;
const THIRD_START = 10;
const LONG_START = 25;
const LAST_START = 130;
const LAST_TEXT = "最後に、その他の連絡事項があればお願いします。";

const SIZES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
] as const;

let run = 0;

async function open(browser: Browser, size: { width: number; height: number }) {
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    viewport: { width: size.width, height: size.height },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${FIXTURE}?run=${++run}#${ARRANGEMENT}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    ARRANGEMENT,
  );
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    "the phone context answers a coarse pointer",
  ).toBe(true);
  await expect(page.locator("[data-cue-start]").first()).toBeVisible();
  return { context, page };
}

function row(page: Page, start: number) {
  return page.locator(`[data-cue-start="${start}"]`);
}

function seek(rowLocator: ReturnType<typeof row>) {
  return rowLocator.locator("button").first();
}

function list(page: Page) {
  return page.locator("[data-cue-start]").first().locator("xpath=..");
}

/**
 * The area a hit test reaches around a control's centre, in viewport px.
 * A button's own box understates it when the hit area is a pseudo-element.
 */
function hitAreaOf(element: Element) {
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const owns = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && (hit === element || element.contains(hit));
  };
  const walk = (dx: number, dy: number) => {
    let distance = 0;
    while (
      distance < 60 &&
      owns(cx + dx * (distance + 1), cy + dy * (distance + 1))
    ) {
      distance += 1;
    }
    return distance;
  };
  const left = walk(-1, 0);
  const right = walk(1, 0);
  const up = walk(0, -1);
  const down = walk(0, 1);
  return {
    left: cx - left,
    right: cx + right,
    top: cy - up,
    bottom: cy + down,
    width: left + right + 1,
    height: up + down + 1,
  };
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

function topRowStart(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-cue-start]"),
    );
    const box = rows[0]?.parentElement;
    if (!box) return -1;
    const top = box.getBoundingClientRect().top;
    const first = rows.find((element) => element.getBoundingClientRect().bottom > top);
    return first ? Number(first.dataset.cueStart) : -1;
  });
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`SPEC-ADDON-125 I1 at ${at}: no row draws an edit or quote control before it is tapped`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      await expect(
        page.getByRole("button", { name: "修正", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "引用", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-125 I10 §10 at ${at}: with no strip the utterance text has the row's width`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const box = await page
        .getByText(TEXTS[0], { exact: true })
        .boundingBox();
      expect(box).not.toBeNull();
      const [floor, ceiling] = size.width === 390 ? [300, 330] : [285, 315];
      expect(box!.width, "the text column").toBeGreaterThanOrEqual(floor);
      expect(box!.width, "the text column").toBeLessThanOrEqual(ceiling);
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-125 I10 I11 at ${at}: the strip's buttons reach 44×44 and overlap neither the seek area nor the next row`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const target = row(page, SECOND_START);
      await seek(target).click();

      const edit = target.getByRole("button", { name: "修正", exact: true });
      const quote = target.getByRole("button", { name: "引用", exact: true });
      await expect(edit).toHaveCount(1);
      await expect(quote).toHaveCount(1);
      await expect(edit).toBeVisible();

      const editHit = (await edit.evaluate(hitAreaOf)) as Box;
      const quoteHit = (await quote.evaluate(hitAreaOf)) as Box;
      for (const [name, hit] of [
        ["修正", editHit],
        ["引用", quoteHit],
      ] as const) {
        expect(hit.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(hit.height, `${name} height`).toBeGreaterThanOrEqual(44);
      }

      const seekBox = (await seek(target).boundingBox())!;
      const nextBox = (await row(page, THIRD_START).boundingBox())!;
      const seekArea: Box = {
        top: seekBox.y,
        bottom: seekBox.y + seekBox.height,
        left: seekBox.x,
        right: seekBox.x + seekBox.width,
        width: seekBox.width,
        height: seekBox.height,
      };
      const nextArea: Box = {
        top: nextBox.y,
        bottom: nextBox.y + nextBox.height,
        left: nextBox.x,
        right: nextBox.x + nextBox.width,
        width: nextBox.width,
        height: nextBox.height,
      };
      expect(overlaps(editHit, seekArea), "修正 over the seek area").toBe(false);
      expect(overlaps(quoteHit, seekArea), "引用 over the seek area").toBe(false);
      expect(editHit.bottom, "修正 over the next row").toBeLessThanOrEqual(
        nextArea.top + 0.5,
      );
      expect(quoteHit.bottom, "引用 over the next row").toBeLessThanOrEqual(
        nextArea.top + 0.5,
      );
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-125 I11 at ${at}: tapping the long row brings its strip fully into the list`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const target = row(page, LONG_START);
      await seek(target).click();

      const edit = target.getByRole("button", { name: "修正", exact: true });
      const quote = target.getByRole("button", { name: "引用", exact: true });
      await expect(edit).toHaveCount(1);
      await expect(quote).toHaveCount(1);
      await expect(edit).toBeVisible();
      await expect(quote).toBeVisible();

      const box = (await list(page).boundingBox())!;
      for (const [name, control] of [
        ["修正", edit],
        ["引用", quote],
      ] as const) {
        const controlBox = (await control.boundingBox())!;
        expect(controlBox.y, `${name} above the list`).toBeGreaterThanOrEqual(
          box.y - 0.5,
        );
        expect(
          controlBox.y + controlBox.height,
          `${name} below the list`,
        ).toBeLessThanOrEqual(box.y + box.height + 0.5);
      }
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-125 I11 at ${at}: with a strip present, following brings the playing row into view`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const target = row(page, SECOND_START);
      await seek(target).click();
      await expect(
        target.getByRole("button", { name: "引用", exact: true }),
      ).toHaveCount(1);

      await page.evaluate(
        (start) => window.__transcriptTouch!.seekTo(start),
        LAST_START,
      );
      const active = page.locator('[aria-current="true"]');
      await expect(active).toContainText(LAST_TEXT, { timeout: 5000 });

      const box = (await list(page).boundingBox())!;
      await expect
        .poll(
          async () => {
            const activeBox = await active.boundingBox();
            if (!activeBox) return false;
            return (
              activeBox.y < box.y + box.height &&
              activeBox.y + activeBox.height > box.y
            );
          },
          { timeout: 5000 },
        )
        .toBe(true);
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-126 I10 §10 at ${at}: the dialog sits 56px down with 16px sides and its controls reach 44×44`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const target = row(page, LONG_START);
      await seek(target).click();
      const edit = target.getByRole("button", { name: "修正", exact: true });
      await expect(edit).toHaveCount(1);
      await edit.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toBeVisible();
      await dialog.evaluate((el) =>
        Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
      );

      const box = (await dialog.boundingBox())!;
      expect(Math.abs(box.y - 56), "dialog top").toBeLessThanOrEqual(1);
      expect(Math.abs(box.x - 16), "dialog left").toBeLessThanOrEqual(1);
      expect(
        Math.abs(box.x + box.width - (size.width - 16)),
        "dialog right",
      ).toBeLessThanOrEqual(1);
      expect(box.width, "dialog width").toBeLessThanOrEqual(448);

      for (const name of ["閉じる", "キャンセル", "保存"]) {
        const control = (
          await dialog.getByRole("button", { name, exact: true }).boundingBox()
        )!;
        expect(control.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(control.height, `${name} height`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await context.close();
    }
  });

  test(`SPEC-ADDON-126 §10 at ${at}: with a 2,000-character utterance, 保存 ends above y=367`, async ({
    browser,
  }) => {
    const { context, page } = await open(browser, size);
    try {
      const target = row(page, LONG_START);
      await seek(target).click();
      const edit = target.getByRole("button", { name: "修正", exact: true });
      await expect(edit).toHaveCount(1);
      await edit.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveCount(1);
      await dialog.evaluate((el) =>
        Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
      );
      const field = dialog.getByRole("textbox");
      await expect(field).toHaveValue(
        "長い発話の続きです。".repeat(200),
      );
      const save = (
        await dialog.getByRole("button", { name: "保存", exact: true }).boundingBox()
      )!;
      expect(save.y + save.height, "the bottom of 保存").toBeLessThanOrEqual(367);
    } finally {
      await context.close();
    }
  });
}

test("SPEC-ADDON-125 I11 at 390x844: with a strip present, the saved scroll place restores the same row", async ({
  browser,
}) => {
  const { context, page } = await open(browser, { width: 390, height: 844 });
  try {
    const target = row(page, THIRD_START);
    await seek(target).click();
    await expect(
      target.getByRole("button", { name: "引用", exact: true }),
    ).toHaveCount(1);

    const scroller = list(page);
    await scroller.hover();
    await page.mouse.wheel(0, 600);
    await expect(
      page.getByRole("button", { name: "再生位置に戻る" }),
    ).toBeVisible();

    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    const saved = await topRowStart(page);
    expect(saved).not.toBe(0);

    await page.evaluate(() => window.__transcriptTouch!.remount());
    await expect(page.locator("[data-cue-start]")).toHaveCount(0);
    await page.evaluate(() => window.__transcriptTouch!.remount());
    await expect(page.locator("[data-cue-start]")).toHaveCount(7);

    await expect
      .poll(() => topRowStart(page), { timeout: 5000 })
      .toBe(saved);
  } finally {
    await context.close();
  }
});
