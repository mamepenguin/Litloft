/**
 * Boxes of the app header drawn by the real Video and Reading pages. A piece of text is
 * "whole" when no box between it and the header clips it: an ellipsis-cut text keeps its
 * full width in layout and runs past the box that hides it.
 */

import { expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;

export const LONG_FOLDER_NAME = "Every holiday film we recorded in the summer of 2019";
export const CAMERA_FOLDER_NAME = "2025 summer trip, camera footage only";
export const SHORT_FOLDER_NAME = "Trips";
export const LONG_DRIVE_NAME = "Household archive on the second NAS in the study";
export const LONG_SHELF_TITLE = "A shelf whose name runs on far past the width of any phone screen";

export type AppPage = "video" | "reading" | "video-shelf" | "reading-shelf";
export const APP_PAGES: readonly AppPage[] = ["video", "reading", "video-shelf", "reading-shelf"];
export const SHELF_PAGES: readonly AppPage[] = ["video-shelf", "reading-shelf"];

export const DEFAULT_TARGET_NAME: Record<AppPage, string> = {
  video: "All videos",
  "video-shelf": "All videos",
  reading: "All books",
  "reading-shelf": "All books",
};

let navigation = 0;

export type TargetKind = "long" | "camera" | "trips";

const TARGET_NAMES: Record<TargetKind, string> = {
  long: LONG_FOLDER_NAME,
  camera: CAMERA_FOLDER_NAME,
  trips: SHORT_FOLDER_NAME,
};

export async function openAppHeader(
  page: Page,
  width: number,
  options: { app: AppPage; drive?: string; longTarget?: boolean; target?: TargetKind; key?: string; locale?: "ja" },
): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  const kind: TargetKind | null = options.target ?? (options.longTarget ? "long" : null);
  const q = new URLSearchParams({ run: String(++navigation), page: options.app });
  if (options.drive) q.set("drive", options.drive);
  if (kind) q.set("target", kind);
  if (options.key) q.set("key", options.key);
  if (options.locale) q.set("locale", options.locale);
  await page.goto(`${FIXTURE}?${q}#app-header`);
  await expect(page.locator("body")).toHaveAttribute("data-harness", "ready");
  await expect(page.locator("header h1")).toBeVisible();
  await expect(page.locator("header").getByText(/\d[\d,]* (videos|books)/)).toBeVisible();
  const targetName = kind ? TARGET_NAMES[kind] : DEFAULT_TARGET_NAME[options.app];
  await expect(targetButton(page)).toHaveAttribute("aria-label", `Target: ${targetName}`);
}

export function targetButton(page: Page) {
  return page.locator("header").getByRole("button", { name: /^(Target|対象): / });
}

export function sortButton(page: Page) {
  return page.locator("header").getByRole("button", { name: /^Sort: / });
}

export type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

export type TextBox = Box & { whole: boolean };

export type SpanMetrics = { scrollWidth: number; clientWidth: number; textOverflow: string };

export type HeaderSnapshot = {
  viewport: number;
  scrollWidth: number;
  headerWidth: number;
  contentLeft: number;
  contentRight: number;
  overflowRight: number;
  h1: Box & { scrollWidth: number; clientWidth: number; lineHeight: number; textOverflow: string };
  icon: Box | null;
  target: Box;
  targetText: string;
  targetSvgs: Box[];
  targetNameSpan: SpanMetrics | null;
  sort: (Box & { text: string; svgs: Box[] }) | null;
  tabs: Box | null;
  count: TextBox;
  separator: TextBox;
  drive: TextBox;
  targetName: TextBox;
  targetNameFirstThree: TextBox;
};

export async function snapshot(
  page: Page,
  names: { drive: string; targetName: string },
): Promise<HeaderSnapshot> {
  return page.evaluate(({ drive, targetName }) => {
    const header = document.querySelector("header")!;
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };

    const textNodes = (root: Element) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const out: Text[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
      return out;
    };

    const textBox = (root: Element, match: RegExp | string) => {
      for (const node of textNodes(root)) {
        const text = node.data;
        let start = -1;
        let length = 0;
        if (typeof match === "string") {
          start = text.indexOf(match);
          length = match.length;
        } else {
          const m = match.exec(text);
          if (m) {
            start = m.index;
            length = m[0].length;
          }
        }
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + length);
        const r = range.getBoundingClientRect();
        let whole = r.right <= window.innerWidth + 0.5 && r.left >= -0.5;
        for (let el: Element | null = node.parentElement; el && whole; el = el.parentElement) {
          if (getComputedStyle(el).overflowX !== "visible") {
            const b = el.getBoundingClientRect();
            if (r.right > b.right + 0.5 || r.left < b.left - 0.5) whole = false;
          }
          if (el === header) break;
        }
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, whole };
      }
      return null;
    };

    const h1 = header.querySelector("h1")!;
    const h1Style = getComputedStyle(h1);
    const target = Array.from(header.querySelectorAll("button")).find((b) =>
      /^(Target|対象): /.test(b.getAttribute("aria-label") ?? ""),
    )!;
    const sort = Array.from(header.querySelectorAll("button")).find((b) =>
      /^Sort: /.test(b.getAttribute("aria-label") ?? ""),
    );
    const tabs = header.querySelector('[role="tablist"]');
    const icon = h1.closest("header")!.querySelector(".lucide-film, .lucide-book-open");
    const headerStyle = getComputedStyle(header);
    const headerBox = header.getBoundingClientRect();

    const found = (what: string, b: ReturnType<typeof textBox>) => {
      if (!b) throw new Error(`${what} text not found in the header`);
      return b;
    };
    const count = found("count", textBox(header, /\d[\d,]* (videos|books)/));
    const separator = found("separator", textBox(header, "·"));
    const driveBox = found("drive", textBox(header, drive));
    const name = found("target name", textBox(target, targetName));
    const nameFirstThree = found("target name", textBox(target, targetName.slice(0, 3)));
    const nameNode = textNodes(target).find((n) => n.data.includes(targetName));

    const all = Array.from(header.querySelectorAll("*"));
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      headerWidth: headerBox.width,
      contentLeft: headerBox.left + parseFloat(headerStyle.paddingLeft),
      contentRight: headerBox.right - parseFloat(headerStyle.paddingRight),
      overflowRight: Math.max(...all.map((el) => el.getBoundingClientRect().right)),
      h1: {
        ...box(h1),
        scrollWidth: h1.scrollWidth,
        clientWidth: h1.clientWidth,
        lineHeight: parseFloat(h1Style.lineHeight),
        textOverflow: h1Style.textOverflow,
      },
      icon: icon ? box(icon.parentElement!) : null,
      target: box(target),
      targetText: target.innerText,
      targetSvgs: Array.from(target.querySelectorAll("svg")).map(box),
      targetNameSpan: nameNode?.parentElement
        ? {
            scrollWidth: nameNode.parentElement.scrollWidth,
            clientWidth: nameNode.parentElement.clientWidth,
            textOverflow: getComputedStyle(nameNode.parentElement).textOverflow,
          }
        : null,
      sort: sort ? { ...box(sort), text: sort.innerText, svgs: Array.from(sort.querySelectorAll("svg")).map(box) } : null,
      tabs: tabs ? box(tabs) : null,
      count,
      separator,
      drive: driveBox,
      targetName: name,
      targetNameFirstThree: nameFirstThree,
    };
  }, names);
}

/** Vertical overlap: the two boxes share a row. */
export function sameRow(a: Box, b: Box): boolean {
  return a.top < b.bottom - 1 && b.top < a.bottom - 1;
}

export async function colourOf(page: Page, probe: "elevated" | "muted"): Promise<string> {
  return page.evaluate((id) => {
    const el = document.getElementById(`probe-${id}`)!;
    const style = getComputedStyle(el);
    return id === "elevated" ? style.backgroundColor : style.color;
  }, probe);
}

export const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** A control's value text and the box that clips it. */
export async function valueSpanOf(
  control: ReturnType<Page["locator"]>,
  text: string,
): Promise<SpanMetrics | null> {
  return control.evaluate((el, wanted) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n as Text).data.includes(wanted)) continue;
      const span = n.parentElement!;
      return {
        scrollWidth: span.scrollWidth,
        clientWidth: span.clientWidth,
        textOverflow: getComputedStyle(span).textOverflow,
      };
    }
    return null;
  }, text);
}

/** The control's own fill, border, size and colour, and the colour its `text` is drawn in. */
export async function lookOf(control: ReturnType<Page["locator"]>, text: string) {
  return control.evaluate((el, wanted) => {
    const s = getComputedStyle(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textColour: string | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n as Text).data.includes(wanted)) {
        textColour = getComputedStyle(n.parentElement!).color;
        break;
      }
    }
    return {
      background: s.backgroundColor,
      borderWidths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      color: s.color,
      textColour,
      fontSize: s.fontSize,
      height: el.getBoundingClientRect().height,
    };
  }, text);
}
