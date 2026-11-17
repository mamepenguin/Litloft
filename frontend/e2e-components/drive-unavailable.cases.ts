/**
 * SPEC-CORE-125 D1, D2, D3, I9: the unavailable-drive state measured with the real stylesheet.
 * jsdom lays nothing out, so placement, touch targets and overflow are only real here.
 */

import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

import { PAGE } from "./build-bundle";

const FIXTURE = pathToFileURL(PAGE).href;
const TITLE = /^Can't open the drive “.+”$/;

let run = 0;

async function open(page: Page, id: "drive-unavailable" | "drive-unavailable-long"): Promise<void> {
  await page.goto(`${FIXTURE}?run=${++run}#${id}`);
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  await expect(page.locator("body")).toHaveAttribute("data-arrangement", id);
}

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface Link {
  text: string;
  rect: Rect;
  fontSize: string;
  background: string;
  color: string;
}

interface Measure {
  h1Count: number;
  title: string;
  h1: Rect;
  h1Style: { fontSize: string; fontWeight: string; textAlign: string };
  tile: Rect & { radius: string; background: string };
  icon: Rect & { color: string };
  links: Link[];
  box: Rect & { paddingLeft: string; paddingRight: string; paddingBottom: string };
  groupCentre: number;
  scrollWidth: number;
  clientWidth: number;
  bodyText: string;
  muted: string;
  elevated: string;
}

function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const rect = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const probe = (cls: string, prop: "color" | "backgroundColor") => {
      const el = document.createElement("div");
      el.className = cls;
      document.body.appendChild(el);
      const v = getComputedStyle(el)[prop];
      el.remove();
      return v;
    };
    const h1s = [...document.querySelectorAll("h1")];
    const h1 = h1s[0];
    const tileEl = h1.previousElementSibling as HTMLElement;
    const rowEl = h1.nextElementSibling as HTMLElement;
    const group = h1.parentElement as HTMLElement;
    let box: HTMLElement = group;
    for (let el: HTMLElement | null = group; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.display === "flex" && s.flexDirection === "column" && s.justifyContent === "center") {
        box = el;
        break;
      }
    }
    const boxStyle = getComputedStyle(box);
    const tileStyle = getComputedStyle(tileEl);
    const svg = tileEl.querySelector("svg")!;
    const h1Style = getComputedStyle(h1);
    const links = [...rowEl.querySelectorAll("a")].map((a) => {
      const s = getComputedStyle(a);
      return {
        text: a.textContent ?? "",
        rect: rect(a),
        fontSize: s.fontSize,
        background: s.backgroundColor,
        color: s.color,
      };
    });
    const groupTop = rect(tileEl).top;
    const groupBottom = rect(rowEl).bottom;
    return {
      h1Count: h1s.length,
      title: h1.textContent ?? "",
      h1: rect(h1),
      h1Style: { fontSize: h1Style.fontSize, fontWeight: h1Style.fontWeight, textAlign: h1Style.textAlign },
      tile: { ...rect(tileEl), radius: tileStyle.borderTopLeftRadius, background: tileStyle.backgroundColor },
      icon: { ...rect(svg), color: getComputedStyle(svg).color },
      links,
      box: {
        ...rect(box),
        paddingLeft: boxStyle.paddingLeft,
        paddingRight: boxStyle.paddingRight,
        paddingBottom: boxStyle.paddingBottom,
      },
      groupCentre: (groupTop + groupBottom) / 2,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyText: document.body.innerText,
      muted: probe("text-muted", "color"),
      elevated: probe("bg-elevated", "backgroundColor"),
    };
  });
}

function sharedCases(coarse: boolean): void {
  test("SPEC-CORE-125 D1 D2: tile, heading and link row are stacked 16px apart and centred, with no other text", async ({
    page,
  }) => {
    await open(page, "drive-unavailable");
    const m = await measure(page);

    expect(m.h1Count).toBe(1);
    expect(m.title).toMatch(TITLE);
    expect(m.tile.width).toBeCloseTo(48, 0);
    expect(m.tile.height).toBeCloseTo(48, 0);
    expect(m.tile.radius).toBe("16px");
    expect(m.tile.background).toBe(m.elevated);
    expect(m.icon.width).toBeCloseTo(24, 0);
    expect(m.icon.height).toBeCloseTo(24, 0);
    expect(m.icon.color).toBe(m.muted);

    expect(m.h1.top - m.tile.bottom).toBeCloseTo(16, 0);
    expect(m.links[0].rect.top - m.h1.bottom).toBeGreaterThanOrEqual(15);
    expect(m.links[0].rect.top - m.h1.bottom).toBeLessThanOrEqual(17);
    expect(m.h1Style).toEqual({ fontSize: "18px", fontWeight: "700", textAlign: "center" });

    const boxCentre = (m.box.left + m.box.right) / 2;
    for (const part of [m.tile, m.h1]) {
      expect(Math.abs((part.left + part.right) / 2 - boxCentre)).toBeLessThanOrEqual(1);
    }
    const rowLeft = Math.min(...m.links.map((l) => l.rect.left));
    const rowRight = Math.max(...m.links.map((l) => l.rect.right));
    expect(Math.abs((rowLeft + rowRight) / 2 - boxCentre)).toBeLessThanOrEqual(1);

    expect(m.bodyText).not.toMatch(/Add|Drop|No files|upload/i);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  });

  test("SPEC-CORE-125 D1: the box centres the group with 24px side and 120px bottom padding, so it sits 60px above the centre", async ({
    page,
  }) => {
    await open(page, "drive-unavailable");
    const m = await measure(page);

    expect(m.box.paddingLeft).toBe("24px");
    expect(m.box.paddingRight).toBe("24px");
    expect(m.box.paddingBottom).toBe("120px");
    const boxCentre = (m.box.top + m.box.bottom) / 2;
    expect(boxCentre - m.groupCentre).toBeGreaterThanOrEqual(58);
    expect(boxCentre - m.groupCentre).toBeLessThanOrEqual(62);
  });

  test("SPEC-CORE-125 D3: All drives is Sand, Unlock is Ghost in the muted colour, 8px apart, 14px labels", async ({
    page,
  }) => {
    await open(page, "drive-unavailable");
    const m = await measure(page);

    expect(m.links.map((l) => l.text.trim())).toEqual(["All drives", "Unlock"]);
    const [all, unlock] = m.links;
    expect(all.fontSize).toBe("14px");
    expect(unlock.fontSize).toBe("14px");
    expect(all.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(unlock.background).toBe("rgba(0, 0, 0, 0)");
    expect(unlock.color).toBe(m.muted);
    expect(unlock.rect.left - all.rect.right).toBeCloseTo(8, 0);
  });

  test(`SPEC-CORE-125 I9: each link's touch target is ${coarse ? "at least 44px" : "the general size, under 44px"} tall`, async ({
    page,
  }) => {
    await open(page, "drive-unavailable");
    const m = await measure(page);

    for (const link of m.links) {
      if (coarse) expect(link.rect.height).toBeGreaterThanOrEqual(44);
      else expect(link.rect.height).toBeLessThan(44);
    }
  });

  test("SPEC-CORE-125 I9 D3: an 80-character drive name stays inside the box, wraps, and the page does not scroll sideways; no Unlock link", async ({
    page,
  }) => {
    await open(page, "drive-unavailable-long");
    const m = await measure(page);

    expect(m.title).toMatch(/[^\s“”]{80}/);
    expect(m.h1.left).toBeGreaterThanOrEqual(m.box.left + 24 - 0.5);
    expect(m.h1.right).toBeLessThanOrEqual(m.box.right - 24 + 0.5);
    expect(m.h1.height).toBeGreaterThan(30);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
    expect(m.links.map((l) => l.text.trim())).toEqual(["All drives"]);
    if (coarse) expect(m.links[0].rect.height).toBeGreaterThanOrEqual(44);
  });
}

export function phoneCases(): void {
  sharedCases(true);
}

export function desktopCases(): void {
  sharedCases(false);
}
