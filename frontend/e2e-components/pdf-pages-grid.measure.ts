/**
 * Opening the real file page on the 225-page fixture PDF and measuring its
 * Pages rail.
 */

import { expect, type Page } from "@playwright/test";

import { FIXTURE_URL } from "./fixtureOrigin";
import enMessages from "../src/messages-core/en.json";

export const PDF = "pdf000000001";
export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const PAGES = 225;
export const FIRST_RATIO = 792 / 612;

let navigation = 0;

export async function open(
  page: Page,
  {
    viewport = DESKTOP,
    pdf = "long",
    scrollbar,
  }: { viewport?: { width: number; height: number }; pdf?: string; scrollbar?: number } = {},
): Promise<void> {
  await page.addInitScript((scrollbarWidth) => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("workbench-panels", "[]");
      localStorage.setItem("inspector-open:fixture", "true");
      localStorage.setItem("sidebar-open", "true");
      sessionStorage.setItem("__seeded", "1");
    }
    if (scrollbarWidth !== null) {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        // The app's inherited `scrollbar-color` makes Chromium ignore `::-webkit-scrollbar`.
        style.textContent = `* { scrollbar-color: auto !important; } *::-webkit-scrollbar { width: ${scrollbarWidth}px; height: 0; } *::-webkit-scrollbar-thumb { background: #888; }`;
        document.head.append(style);
      });
    }
    // Every scroll the page writes, so a case can ask which element moved.
    const log: { target: Element; at: number }[] = [];
    (window as unknown as { __scrollWrites: typeof log }).__scrollWrites = log;
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() {
        return scrollTop.get!.call(this);
      },
      set(value: number) {
        log.push({ target: this, at: performance.now() });
        scrollTop.set!.call(this, value);
      },
    });
    for (const name of ["scrollTo", "scroll", "scrollBy", "scrollIntoView"] as const) {
      const native = Element.prototype[name] as (...args: unknown[]) => void;
      (Element.prototype as unknown as Record<string, unknown>)[name] = function (
        this: Element,
        ...args: unknown[]
      ) {
        log.push({ target: this, at: performance.now() });
        return native.apply(this, args);
      };
    }
  }, scrollbar ?? null);
  await page.setViewportSize(viewport);
  const params = new URLSearchParams({
    run: String(++navigation),
    query: `file=${PDF}`,
    pdf,
  });
  await page.goto(`${FIXTURE_URL}?${params}#focus-drive`);
  await expect(page.locator("body[data-ready='1']")).toHaveCount(1);
  await expect(page.locator("section[data-pdf-page]").first()).toBeVisible();
}

export const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true }).filter({ visible: true });

export async function selectTab(page: Page, name: string): Promise<void> {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
}

export async function showPages(page: Page): Promise<void> {
  await selectTab(page, "Pages");
  await expect.poll(() => measure(page).then((m) => m.cells.length)).toBe(PAGES);
}

export async function raiseSheet(page: Page): Promise<void> {
  await page
    .getByTestId("mobile-inspector-peek")
    .getByRole("button", { name: enMessages.inspector.expandSheet })
    .click();
}

export async function jumpTo(page: Page, target: number): Promise<void> {
  const input = page.getByLabel("Page number").filter({ visible: true });
  await input.fill(String(target));
  await input.press("Enter");
  await expect(input).toHaveValue(String(target));
}

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface CellMeasure {
  page: number;
  state: string | null;
  current: boolean;
  cell: Rect;
  picture: Rect | null;
  pictureBorder: { width: string; style: string; color: string; background: string } | null;
  pictureOutline: { width: string; style: string; offset: string } | null;
  number: { weight: number; color: string } | null;
}

export interface Measure {
  cells: CellMeasure[];
  rail: { clientWidth: number; scrollWidth: number };
  scroller: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    scrollbar: number;
    isSheet: boolean;
    /** `--inspector-sticky-top` as written, and the sheet's tab strip bottom from the scroller's top. */
    stickyTop: string;
    tabStripBottom: number | null;
  };
  /** The scroller's box on screen. */
  box: { top: number; bottom: number };
  /** The box a followed cell is centred in: below the sticky strip on the phone. */
  visible: { top: number; bottom: number };
  /** The scroller's box extended by half its height above and below. */
  extended: { top: number; bottom: number };
}

/**
 * The rail, its cells and the scroller they are measured against: the closest
 * `data-inspector-scroller` ancestor, else the nearest scrolling ancestor.
 * On the phone the box a followed cell is centred in starts below the sticky
 * tab strip.
 */
export function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    };
    const rails = [
      ...document.querySelectorAll<HTMLElement>('ol[aria-label="Page thumbnails"]'),
    ].filter((el) => el.getClientRects().length > 0);
    const rail = rails[0];
    if (!rail) {
      return {
        cells: [],
        rail: { clientWidth: 0, scrollWidth: 0 },
        scroller: {
          scrollTop: 0,
          scrollHeight: 0,
          clientHeight: 0,
          scrollbar: 0,
          isSheet: false,
          stickyTop: "",
          tabStripBottom: null,
        },
        box: { top: 0, bottom: 0 },
        visible: { top: 0, bottom: 0 },
        extended: { top: 0, bottom: 0 },
      };
    }
    const sheet = rail.closest<HTMLElement>("[data-inspector-scroller]");
    let scroller: HTMLElement | null = sheet;
    for (let el = rail.parentElement; !scroller && el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") scroller = el;
    }
    scroller ??= document.scrollingElement as HTMLElement;
    const box = rect(scroller);
    const stickyTop = getComputedStyle(rail).getPropertyValue("--inspector-sticky-top").trim();
    const sticky = sheet ? parseFloat(stickyTop) : 0;
    const boxTop = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight);
    const half = (bottom - boxTop) / 2;
    const style = getComputedStyle(scroller);
    const tabStrip = sheet?.querySelector('[role="tablist"]');

    const cells = [...rail.querySelectorAll<HTMLElement>("[data-page-state]")].map((cell) => {
      const button = (cell.matches("button") ? cell : cell.querySelector("button"))!;
      const picture =
        [...button.querySelectorAll<HTMLElement>("*")].find(
          (el) => getComputedStyle(el).borderTopWidth === "1px",
        ) ?? null;
      const pictureStyle = picture ? getComputedStyle(picture) : null;
      const label =
        [...button.querySelectorAll<HTMLElement>("*")].find(
          (el) => el.children.length === 0 && /^\d+$/.test((el.textContent ?? "").trim()),
        ) ?? null;
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        page: Number((button.getAttribute("aria-label") ?? "").replace(/\D+/g, "")),
        state: cell.getAttribute("data-page-state"),
        current: button.getAttribute("aria-current") === "true",
        cell: rect(cell),
        picture: picture ? rect(picture) : null,
        pictureBorder: pictureStyle
          ? {
              width: pictureStyle.borderTopWidth,
              style: pictureStyle.borderTopStyle,
              color: pictureStyle.borderTopColor,
              background: pictureStyle.backgroundColor,
            }
          : null,
        pictureOutline: pictureStyle
          ? {
              width: pictureStyle.outlineWidth,
              style: pictureStyle.outlineStyle,
              offset: pictureStyle.outlineOffset,
            }
          : null,
        number: labelStyle
          ? { weight: Number(labelStyle.fontWeight), color: labelStyle.color }
          : null,
      };
    });

    return {
      cells,
      rail: { clientWidth: rail.clientWidth, scrollWidth: rail.scrollWidth },
      scroller: {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        scrollbar:
          scroller.offsetWidth -
          scroller.clientWidth -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth),
        isSheet: sheet !== null,
        stickyTop,
        tabStripBottom: tabStrip ? tabStrip.getBoundingClientRect().bottom - boxTop : null,
      },
      box: { top: boxTop, bottom },
      visible: { top: boxTop + sticky, bottom },
      extended: { top: boxTop - half, bottom: bottom + half },
    };
  });
}

/** Writes `scrollTop` on the rail's scroller, as a reader's scroll would. */
export function scrollRail(page: Page, to: { top?: number; by?: number }): Promise<number> {
  return page.evaluate(({ top, by }) => {
    const rail = [
      ...document.querySelectorAll<HTMLElement>('ol[aria-label="Page thumbnails"]'),
    ].find((el) => el.getClientRects().length > 0)!;
    let scroller: HTMLElement | null = rail.closest("[data-inspector-scroller]");
    for (let el = rail.parentElement; !scroller && el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") scroller = el;
    }
    scroller!.scrollTop = top ?? scroller!.scrollTop + (by ?? 0);
    return scroller!.scrollTop;
  }, to);
}

/** Remembers the scrollTop of every element in the inspector and every ancestor of the rail. */
export function snapshotScroll(page: Page): Promise<void> {
  return page.evaluate(() => {
    const rail = [
      ...document.querySelectorAll<HTMLElement>('ol[aria-label="Page thumbnails"]'),
    ].find((el) => el.getClientRects().length > 0)!;
    const inspector = rail.closest("aside") ?? document.body;
    const watched = new Map<Element, number>();
    for (const el of inspector.querySelectorAll("*")) watched.set(el, el.scrollTop);
    for (let el: Element | null = rail; el; el = el.parentElement) watched.set(el, el.scrollTop);
    (window as unknown as { __scrollSnapshot: unknown }).__scrollSnapshot = {
      window: window.scrollY,
      watched,
    };
  });
}

/**
 * The elements whose scrollTop differs from the snapshot, an element added
 * since counting from 0, named `scroller` for the rail's scroller.
 */
export function scrolledSinceSnapshot(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const snapshot = (
      window as unknown as {
        __scrollSnapshot: { window: number; watched: Map<Element, number> };
      }
    ).__scrollSnapshot;
    const rail = [
      ...document.querySelectorAll<HTMLElement>('ol[aria-label="Page thumbnails"]'),
    ].find((el) => el.getClientRects().length > 0)!;
    let scroller: Element | null = rail.closest("[data-inspector-scroller]");
    for (let el = rail.parentElement; !scroller && el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") scroller = el;
    }
    const inspector = rail.closest("aside") ?? document.body;
    const now = new Set<Element>([...inspector.querySelectorAll("*")]);
    for (let el: Element | null = rail; el; el = el.parentElement) now.add(el);
    const moved = [...now]
      .filter((el) => el.scrollTop !== (snapshot.watched.get(el) ?? 0))
      .map((el) =>
        el === scroller ? "scroller" : `${el.tagName.toLowerCase()}.${el.className}`,
      );
    if (window.scrollY !== snapshot.window) moved.push("window");
    return moved;
  });
}

export const firstRow = (m: Measure) =>
  m.cells.filter((c) => Math.abs(c.cell.top - m.cells[0].cell.top) < 1);
export const expectedColumns = (width: number) => Math.max(1, Math.floor((width + 8) / (96 + 8)));
export const nonPlaceholder = (m: Measure) => m.cells.filter((c) => c.state !== "placeholder");
export const byPage = (m: Measure, p: number) => m.cells.find((c) => c.page === p)!;
export const centre = (r: Rect) => (r.top + r.bottom) / 2;
export const ratio = (r: Rect | null) => (r ? r.height / r.width : NaN);
export const currentPages = (m: Measure) => m.cells.filter((c) => c.current).map((c) => c.page);

export function expectGrid(m: Measure) {
  const row = firstRow(m);
  expect(row.length).toBe(expectedColumns(m.rail.clientWidth));
  expect(row.length).toBe(3);
  const widths = row.map((c) => c.cell.width);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  expect(m.rail.scrollWidth).toBe(m.rail.clientWidth);
}

export function expectWithinExtendedBox(m: Measure) {
  for (const c of nonPlaceholder(m)) {
    expect(
      c.cell.bottom > m.extended.top && c.cell.top < m.extended.bottom,
      `page ${c.page} is ${c.state} at ${c.cell.top}–${c.cell.bottom}, outside ${m.extended.top}–${m.extended.bottom}`,
    ).toBe(true);
  }
}

/**
 * The target cell's centre within 8px of the visible box's centre, or, when
 * the scrollTop that would centre it is outside the scroll range, the
 * scroller at that end of its range.
 */
export async function expectCentred(page: Page, target: number) {
  await expect
    .poll(async () => {
      const m = await measure(page);
      const c = byPage(m, target);
      if (!c?.current) return `page ${target} is not current`;
      const off = centre(c.cell) - (m.visible.top + m.visible.bottom) / 2;
      const max = m.scroller.scrollHeight - m.scroller.clientHeight;
      const ideal = m.scroller.scrollTop + off;
      if (ideal < 0) {
        return m.scroller.scrollTop <= 1 ? "centred" : `not at the top: ${m.scroller.scrollTop}`;
      }
      if (ideal > max) {
        return m.scroller.scrollTop >= max - 1
          ? "centred"
          : `not at the end: ${m.scroller.scrollTop} of ${max}`;
      }
      return Math.abs(off) <= 8 ? "centred" : `off centre by ${off.toFixed(1)}px`;
    })
    .toBe("centred");
}

