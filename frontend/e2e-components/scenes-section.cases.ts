import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";
import {
  SCENES_CHANGE_SECONDS,
  SCENES_FRAME_STEP,
  SCENES_FRAMES,
  SCENES_LONG_LABEL,
  SCENES_LONG_TEXT,
  SCENES_SHORT_LABEL,
} from "./fixtures/scenesSectionData";

const FIXTURE = pathToFileURL(PAGE).href;
const HOST = "#scenes-host";
const SECTION = `${HOST} > div`;
const TOLERANCE = 1;
/** The narrowest tile the spec allows, 7rem at the default font size. */
const MIN_TILE_WIDTH = 112;

type Pointer = "mouse" | "touch";

export interface ScenesCase {
  hostWidth: number;
  pointer: Pointer;
  /** Columns the spec's measurement table gives this host. */
  columns: number;
  /** The 9:46:37 file whose 500 frames end at 4:09:30. */
  long?: boolean;
}

function timeLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

async function open(
  page: Page,
  { hostWidth, pointer, long = false }: ScenesCase,
): Promise<void> {
  await openArrangement(
    page,
    `${long ? "scenes-long" : "scenes"}-${hostWidth}`,
    pointer,
  );
}

async function openArrangement(
  page: Page,
  arrangement: string,
  pointer: Pointer,
): Promise<void> {
  await page.goto(`${FIXTURE}#${arrangement}`);
  await expect(page.locator("body")).toHaveAttribute(
    "data-arrangement",
    arrangement,
  );
  expect(
    await page.evaluate(
      (expected) => matchMedia(`(pointer: ${expected})`).matches,
      pointer === "touch" ? "coarse" : "fine",
    ),
  ).toBe(true);

  const header = page.locator(`${HOST} button[aria-expanded]`);
  if (pointer === "touch") await header.tap();
  else await header.click();

  await expect(
    page.locator(`${HOST} button[aria-label^="Play from"]`).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate scenes" }),
  ).toBeVisible();
}

async function sectionHeight(page: Page): Promise<number> {
  const box = await page.locator(SECTION).boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

/** The section's border box against its host's content box. */
async function fill(page: Page): Promise<{ section: number; host: number }> {
  return page.locator(SECTION).evaluate((section) => ({
    section: section.getBoundingClientRect().width,
    host: (section.parentElement as HTMLElement).clientWidth,
  }));
}

/** Columns as the browser laid them out: one distinct left edge per column. */
async function drawnColumns(page: Page): Promise<number> {
  return page.locator(SECTION).evaluate(
    (section) =>
      new Set(
        Array.from(
          section.querySelectorAll<HTMLElement>(
            'button[aria-label^="Play from"]',
          ),
        ).map((tile) => Math.round(tile.getBoundingClientRect().left)),
      ).size,
  );
}

async function drawnTileWidths(page: Page): Promise<number[]> {
  return page.locator(SECTION).evaluate((section) =>
    Array.from(
      section.querySelectorAll<HTMLElement>('button[aria-label^="Play from"]'),
    ).map((tile) => tile.getBoundingClientRect().width),
  );
}

/** The rows that must span the section: the header's chevron and its buttons. */
async function rightEdges(
  page: Page,
): Promise<{ host: number; chevron: number; action: number }> {
  return page.locator(SECTION).evaluate((section) => {
    const host = section.parentElement as HTMLElement;
    const header = section.querySelector<HTMLElement>("button[aria-expanded]");
    if (!header) throw new Error("no header is drawn");
    const chevron = header.lastElementChild as HTMLElement;
    const action = Array.from(
      section.querySelectorAll<HTMLElement>("button"),
    ).find((button) => (button.textContent ?? "").trim() === "Regenerate scenes");
    if (!action) throw new Error("no action row button is drawn");
    return {
      host: host.getBoundingClientRect().right,
      chevron: chevron.getBoundingClientRect().right,
      action: action.getBoundingClientRect().right,
    };
  });
}

/** Every element in the section that has more content than its box. */
async function overflowing(page: Page): Promise<string[]> {
  return page.locator(SECTION).evaluate((root) => {
    const nodes: HTMLElement[] = [root as HTMLElement];
    nodes.push(...Array.from(root.querySelectorAll<HTMLElement>("*")));
    return nodes
      .filter((node) => {
        const { overflowX, overflowY } = getComputedStyle(node);
        return (
          overflowX === "auto" ||
          overflowX === "scroll" ||
          overflowY === "auto" ||
          overflowY === "scroll"
        );
      })
      .filter(
        (node) =>
          node.scrollWidth > node.clientWidth ||
          node.scrollHeight > node.clientHeight,
      )
      .map((node) => `${node.tagName.toLowerCase()}.${node.className}`);
  });
}

interface CardReading {
  label: string;
  text: string;
  /** Lines the label shows before the clamp cuts it. */
  labelLines: number;
  /** True when the label's text needs more lines than the clamp shows. */
  labelClipped: boolean;
}

/** The card under the grid, read as the browser laid it out. */
async function card(page: Page): Promise<CardReading> {
  return page.locator(SECTION).evaluate((root) => {
    const button = root.querySelector<HTMLElement>("button.rounded-xl");
    if (!button) throw new Error("no scene card is drawn");
    const [label, text] = Array.from(
      button.querySelectorAll<HTMLElement>(".line-clamp-2"),
    );
    const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
    return {
      label: label.textContent ?? "",
      text: text?.textContent ?? "",
      labelLines: Math.round(label.clientHeight / lineHeight),
      labelClipped: label.scrollHeight > label.clientHeight,
    };
  });
}

/**
 * Moves the point being looked at to `fraction` of the ruler's width. A mouse
 * hovers; a finger taps, which is the only browse a touch environment has.
 */
async function browse(
  page: Page,
  { pointer }: ScenesCase,
  fraction: number,
): Promise<void> {
  const box = await page
    .getByRole("slider", { name: "Frame timeline" })
    .boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * fraction;
  const y = box!.y + box!.height / 2;
  if (pointer === "touch") await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
  // A tap seeks as well, and the playback marker and the card are read from
  // the shared clock's next sample rather than from the event.
  await page.clock.runFor(1_000);
}

/**
 * Takes the mouse off the section. A mouse browse point survives a playback
 * jump while the pointer is inside, so a window move under the pointer is only
 * a window move once browsing has ended; a finger has no hover, and its point
 * ends with the jump itself.
 */
async function stopBrowsing(page: Page, { pointer }: ScenesCase): Promise<void> {
  if (pointer === "touch") return;
  const host = await page.locator(HOST).boundingBox();
  expect(host).not.toBeNull();
  await page.mouse.move(host!.x + host!.width / 2, host!.y + host!.height + 40);
}

export function scenesSectionCases(cases: ScenesCase[]): void {
  test.describe("SPEC-ADDON-089 I5 — the Scenes section never scrolls and keeps its height", () => {
    for (const scenesCase of cases) {
      const { hostWidth, pointer, columns } = scenesCase;
      test(`${hostWidth}px host, ${pointer}, ${columns} columns`, async ({
        page,
      }) => {
        // Fake timers, so the clock sample that moves the window happens when
        // this case says it does.
        await page.clock.install();
        await open(page, scenesCase);

        const tiles = page.locator(`${HOST} button[aria-label^="Play from"]`);
        await expect(tiles).toHaveCount(3 * columns);

        const width = await fill(page);
        expect(width.section).toBeCloseTo(width.host, 0);
        expect(await drawnColumns(page)).toBe(columns);
        if (columns > 3) {
          for (const tileWidth of await drawnTileWidths(page)) {
            expect(tileWidth).toBeGreaterThanOrEqual(
              MIN_TILE_WIDTH - TOLERANCE,
            );
          }
        }
        expect(await overflowing(page)).toEqual([]);

        // Frame 0 holds the scene with no `visible_text`.
        const opened = await sectionHeight(page);
        const first = await card(page);
        expect(first.label).toBe(SCENES_SHORT_LABEL);
        expect(first.text).toBe("");
        // The card reserves its height as a whole, so a one-line label takes
        // one line and the text follows it directly.
        expect(first.labelLines).toBe(1);

        // Frame 5: still the same window, another scene in the card.
        await browse(page, scenesCase, 0.09);
        const browsed = await sectionHeight(page);
        const second = await card(page);
        expect(second.label).toBe(SCENES_LONG_LABEL);
        expect(second.text).toBe(SCENES_LONG_TEXT);
        expect(second.labelLines).toBe(2);
        expect(second.labelClipped).toBe(true);

        // Back to frame 0, still on the same window.
        await browse(page, scenesCase, 0.005);
        const again = await sectionHeight(page);
        expect((await card(page)).label).toBe(SCENES_SHORT_LABEL);

        await stopBrowsing(page, scenesCase);

        // The first frame of the third row moves the window by two rows.
        const moveFrame = 3 * columns;
        await page.evaluate((time) => {
          window.__scenesPlayback.time = time;
        }, moveFrame * SCENES_FRAME_STEP);
        await page.clock.runFor(1_000);
        await expect(tiles.first()).toHaveAttribute(
          "aria-label",
          `Play from ${timeLabel(2 * columns * SCENES_FRAME_STEP)}`,
        );
        // The window's pictures arrive after the section's settle delay.
        await page.clock.runFor(500);
        await expect(tiles.locator("img")).toHaveCount(3 * columns);
        const moved = await sectionHeight(page);

        expect(await overflowing(page)).toEqual([]);

        for (const height of [browsed, again, moved]) {
          expect(height).toBeCloseTo(opened, 0);
        }

        const edges = await rightEdges(page);
        expect(Math.abs(edges.host - edges.chevron)).toBeLessThanOrEqual(
          TOLERANCE,
        );
        expect(Math.abs(edges.host - edges.action)).toBeLessThanOrEqual(
          TOLERANCE,
        );
      });
    }
  });
}

interface LabelBox {
  text: string;
  left: number;
  right: number;
}

interface LabelReading {
  rulerLeft: number;
  rulerRight: number;
  labels: LabelBox[];
}

/** The label row's spans as the browser drew them, against the ruler's box. */
async function timeLabelBoxes(page: Page): Promise<LabelReading> {
  return page.locator(SECTION).evaluate((root) => {
    const slider = root.querySelector<HTMLElement>('[role="slider"]');
    if (!slider) throw new Error("no ruler is drawn");
    const row = slider.nextElementSibling as HTMLElement | null;
    if (!row) throw new Error("no label row is drawn");
    const ruler = slider.getBoundingClientRect();
    return {
      rulerLeft: ruler.left,
      rulerRight: ruler.right,
      labels: Array.from(row.querySelectorAll<HTMLElement>("span")).map(
        (label) => {
          const box = label.getBoundingClientRect();
          return {
            text: label.textContent ?? "",
            left: box.left,
            right: box.right,
          };
        },
      ),
    };
  });
}

export function scenesTimeLabelCases(cases: ScenesCase[]): void {
  test.describe("I11 — the drawn time labels leave 4 px between boxes", () => {
    for (const scenesCase of cases) {
      const { hostWidth, pointer } = scenesCase;
      test(`${hostWidth}px host, ${pointer}`, async ({ page }) => {
        await page.clock.install();
        await open(page, scenesCase);

        const reading = await timeLabelBoxes(page);
        expect(reading.labels.map((label) => label.text)).toEqual(
          expect.arrayContaining(["0:00", "2:00:00", "9:46:37"]),
        );

        for (const label of reading.labels) {
          expect(label.left).toBeGreaterThanOrEqual(reading.rulerLeft - 0.5);
          expect(label.right).toBeLessThanOrEqual(reading.rulerRight + 0.5);
        }
        for (let i = 1; i < reading.labels.length; i += 1) {
          expect(
            reading.labels[i].left - reading.labels[i - 1].right,
          ).toBeGreaterThanOrEqual(4);
        }
      });
    }
  });
}

interface SwitchReading {
  section: { left: number; right: number; top: number; bottom: number };
  labelRowBottom: number;
  group: { left: number; right: number; top: number; bottom: number };
  groupFramed: boolean;
  chips: {
    left: number;
    right: number;
    top: number;
    height: number;
    pressed: boolean;
    borderTransparent: boolean;
    bold: boolean;
    filled: boolean;
  }[];
  firstTileTop: number;
  /** Elements whose visible box reaches past the section's sides. */
  outside: string[];
}

/** The switch row and its neighbours as the browser laid them out. */
async function switchReading(page: Page): Promise<SwitchReading> {
  return page.locator(SECTION).evaluate((root) => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const slider = root.querySelector<HTMLElement>('[role="slider"]');
    if (!slider) throw new Error("no ruler is drawn");
    const labelRow = slider.nextElementSibling ?? slider;
    const group = root.querySelector<HTMLElement>('[role="group"]');
    if (!group) throw new Error("no switch is drawn");
    const tile = root.querySelector<HTMLElement>('button[aria-label^="Play from"]');
    if (!tile) throw new Error("no tile is drawn");
    const box = rect(root);
    const style = getComputedStyle(group);
    return {
      section: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      labelRowBottom: Math.max(rect(slider).bottom, rect(labelRow).bottom),
      group: {
        left: rect(group).left,
        right: rect(group).right,
        top: rect(group).top,
        bottom: rect(group).bottom,
      },
      groupFramed:
        Number.parseFloat(style.borderTopWidth) > 0 ||
        Number.parseFloat(style.borderLeftWidth) > 0 ||
        (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0),
      chips: Array.from(group.querySelectorAll<HTMLElement>("button")).map((chip) => ({
        left: rect(chip).left,
        right: rect(chip).right,
        top: rect(chip).top,
        height: rect(chip).height,
        pressed: chip.getAttribute("aria-pressed") === "true",
        borderTransparent: /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(
          getComputedStyle(chip).borderTopColor,
        ),
        bold: Number(getComputedStyle(chip).fontWeight) >= 600,
        filled: !/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(
          getComputedStyle(chip).backgroundColor,
        ),
      })),
      firstTileTop: rect(tile).top,
      outside: Array.from(root.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const r = rect(el);
          if (r.width === 0 && r.height === 0) return false;
          // A box an ancestor inside the section clips is not drawn past that
          // ancestor, so only the clipped part can reach the section's sides.
          let left = r.left;
          let right = r.right;
          for (let up = el.parentElement; up && up !== root; up = up.parentElement) {
            if (getComputedStyle(up).overflowX === "visible") continue;
            const clip = rect(up);
            left = Math.max(left, clip.left);
            right = Math.min(right, clip.right);
          }
          return left < box.left - 1 || right > box.right + 1;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    };
  });
}

const CHIP_HEIGHT = 26;

/**
 * Which chip looks selected: an accent border and bold text, no fill; the
 * other has a transparent border, regular weight and no fill.
 */
function selectedLook(chips: SwitchReading["chips"]): [string, string] {
  const looks = chips.map(
    (chip) => !chip.borderTransparent && chip.bold && !chip.filled,
  );
  const plain = chips.map(
    (chip) => chip.borderTransparent && !chip.bold && !chip.filled,
  );
  const index = looks.findIndex(Boolean);
  if (index < 0 || looks.filter(Boolean).length !== 1) return ["none", "-"];
  if (!plain[1 - index]) return ["mixed", "-"];
  return [index === 0 ? "All" : "Cuts", chips[index].pressed ? "pressed" : "unpressed"];
}

async function press(page: Page, pointer: Pointer, name: RegExp): Promise<void> {
  const chip = page
    .getByRole("group", { name: "Frames shown" })
    .getByRole("button", { name });
  if (pointer === "touch") await chip.tap();
  else await chip.click();
}

export function scenesChangesCases(cases: ScenesCase[]): void {
  test.describe("SPEC-ADDON-124 I9 — the frame-list switch keeps the section's layout", () => {
    for (const scenesCase of cases) {
      const { hostWidth, pointer, columns } = scenesCase;
      test(`${hostWidth}px host, ${pointer}, ${columns} columns`, async ({ page }) => {
        await page.clock.install();
        await openArrangement(page, `scenes-changes-${hostWidth}`, pointer);

        const group = page.getByRole("group", { name: "Frames shown" });
        await expect(group).toBeVisible();
        const all = group.getByRole("button", { name: `All ${SCENES_FRAMES}` });
        const cuts = group.getByRole("button", {
          name: `Cuts ${SCENES_CHANGE_SECONDS.length}`,
        });
        await expect(all).toHaveAttribute("aria-pressed", "true");
        await expect(cuts).toHaveAttribute("aria-pressed", "false");

        const tiles = page.locator(`${HOST} button[aria-label^="Play from"]`);
        await expect(tiles).toHaveCount(3 * columns);
        expect(await drawnColumns(page)).toBe(columns);
        expect(await overflowing(page)).toEqual([]);

        const before = await switchReading(page);
        expect(before.group.top).toBeGreaterThanOrEqual(before.labelRowBottom - TOLERANCE);
        expect(before.firstTileTop).toBeGreaterThanOrEqual(before.group.bottom - TOLERANCE);
        expect(before.chips).toHaveLength(2);
        const [first, second] = before.chips;
        expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(first.left - before.section.left)).toBeLessThanOrEqual(TOLERANCE);
        expect(second.left - first.right).toBeCloseTo(4, 0);
        expect(before.group.right).toBeLessThanOrEqual(second.right + TOLERANCE);
        expect(second.right).toBeLessThanOrEqual(before.section.right + TOLERANCE);
        expect(before.groupFramed).toBe(false);
        expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(TOLERANCE);
        // py-1 around a 1rem text-xs line plus a 1 px border, on either pointer.
        for (const chip of before.chips) {
          expect(Math.abs(chip.height - CHIP_HEIGHT)).toBeLessThanOrEqual(TOLERANCE);
        }
        expect(selectedLook(before.chips)).toEqual(["All", "pressed"]);
        expect(before.outside).toEqual([]);

        const height = await sectionHeight(page);
        const ruler = page.getByRole("slider", { name: "Frame timeline" });
        const max = await ruler.getAttribute("aria-valuemax");
        const allTicks = await ruler.screenshot();

        await press(page, pointer, /^Cuts \d+$/);
        await expect(cuts).toHaveAttribute("aria-pressed", "true");
        await expect(all).toHaveAttribute("aria-pressed", "false");
        await expect(tiles.first()).toHaveAttribute(
          "aria-label",
          `Play from ${timeLabel(SCENES_CHANGE_SECONDS[0])}`,
        );
        await expect(tiles).toHaveCount(3 * columns);
        expect(await drawnColumns(page)).toBe(columns);
        expect(await sectionHeight(page)).toBeCloseTo(height, 0);
        await expect(ruler).toHaveAttribute("aria-valuemax", max!);
        expect(await overflowing(page)).toEqual([]);
        const pressed = await switchReading(page);
        expect(pressed.outside).toEqual([]);
        expect(selectedLook(pressed.chips)).toEqual(["Cuts", "pressed"]);
        // Only the ticks differ between the modes: the marks, playhead and
        // browse line stay where they were.
        expect((await ruler.screenshot()).equals(allTicks)).toBe(false);

        // The change tiles' pictures arrive after the settle delay.
        await page.clock.runFor(500);
        await expect(tiles.locator("img")).toHaveCount(3 * columns);

        await press(page, pointer, /^All \d+$/);
        await expect(tiles.first()).toHaveAttribute("aria-label", "Play from 0:00");
        expect((await ruler.screenshot()).equals(allTicks)).toBe(true);
        expect(await sectionHeight(page)).toBeCloseTo(height, 0);
        await expect(ruler).toHaveAttribute("aria-valuemax", max!);
      });
    }
  });
}
