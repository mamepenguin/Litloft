import { act, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import type { SlotEntry } from "@/lib/addons";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";
import { slotMocks, slotPropsByNode } from "./harness";

export const STORE_KEY = "workbench-panels";

export const TRANSCRIPT: SlotEntry = {
  id: "transcript",
  label: "Transcript",
  priority: 10,
  addonName: "intelligence",
};
export const SCENES: SlotEntry = {
  id: "scenes",
  label: "Scenes",
  priority: 20,
  addonName: "intelligence",
};
export const LATE: SlotEntry = {
  id: "late",
  label: "Late",
  priority: 90,
  addonName: "other",
};
export const ASK: SlotEntry = {
  id: "ask",
  label: "Ask",
  priority: 10,
  addonName: "intelligence",
};

/** Under 60.5rem the player row stacks the inspector; at or over it, beside. */
export const NARROW_ROW = 900;
export const WIDE_ROW = 1200;
export const ROW_HEIGHT = 700;

const row = { width: WIDE_ROW, callbacks: [] as Array<() => void> };

/**
 * Every element reports the row's width, and every ResizeObserver is kept so
 * a test can move the row across the stacked threshold the way a window drag
 * does.
 */
export function installRow(width: number) {
  row.width = width;
  row.callbacks = [];
  class ResizeObserverMock {
    constructor(callback: () => void) {
      row.callbacks.push(() => callback());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => row.width,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => (row.width === 0 ? 0 : ROW_HEIGHT),
  );
}

export function resizeRowTo(width: number) {
  row.width = width;
  act(() => {
    for (const cb of row.callbacks) cb();
  });
}

export function storeOpen(open: boolean) {
  window.localStorage.setItem(inspectorOpenStorageKey("main"), String(open));
}

export function storePanels(ids: unknown) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(ids));
}

export function storedPanels(): unknown {
  const raw = window.localStorage.getItem(STORE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

export const fit = () =>
  screen.queryByTestId("inspector-fit-host")?.dataset.inspectorFit;

export const panelGroup = () => screen.queryByRole("group", { name: "Panels" });

/** The toggles' labels, in the order the row draws them; null when no row. */
export function toggleLabels(): string[] | null {
  const group = panelGroup();
  if (!group) return null;
  return within(group)
    .queryAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
}

export function toggle(label: string): HTMLElement {
  const group = panelGroup();
  if (!group) throw new Error("no Panels group is drawn");
  return within(group).getByRole("button", { name: label });
}

/**
 * The panels drawn as cards, in page order: a labelled `<section>` whose
 * `h2` names it and which carries a "Close {label}" button.
 */
export function shownPanels(): string[] {
  return screen
    .queryAllByRole("region")
    .filter((node) => node.tagName === "SECTION")
    .flatMap((node) => {
      const label = node.querySelector("h2")?.textContent?.trim();
      if (!label) return [];
      return within(node).queryByRole("button", { name: `Close ${label}` })
        ? [label]
        : [];
    });
}

export function panelCard(label: string): HTMLElement {
  const card = screen
    .queryAllByRole("region", { name: label })
    .find((node) => node.tagName === "SECTION");
  if (!card) throw new Error(`no ${label} panel is shown`);
  return card;
}

export const tabs = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent?.trim());

export const selectedTab = () =>
  screen
    .queryAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

export function entryNode(id: string): HTMLElement {
  const nodes = screen.queryAllByTestId(`slot-entry-${id}`);
  if (nodes.length !== 1) {
    throw new Error(`slot-entry-${id} is mounted ${nodes.length} times`);
  }
  return nodes[0];
}

export function propsOf(id: string): Record<string, unknown> {
  const props = slotPropsByNode.get(entryNode(id));
  if (!props) throw new Error("the entry was not rendered through the harness");
  return props;
}

export function isHidden(node: Element): boolean {
  return node.closest("[hidden], .hidden") !== null;
}

/**
 * The `file-detail-sections` entries the page draws, read from the stub's
 * include / exclude tag.
 */
export function drawnSectionIds(): Set<string> {
  const all = (slotMocks.entries.get("file-detail-sections") ?? []).map(
    (entry) => entry.id,
  );
  const drawn = new Set<string>();
  for (const node of document.querySelectorAll("[data-testid^='addon-slot-']")) {
    const tag = node.getAttribute("data-testid")!.slice("addon-slot-".length);
    if (tag === "all") all.forEach((id) => drawn.add(id));
    else if (tag.startsWith("include:")) {
      tag.slice(8).split(",").forEach((id) => drawn.add(id));
    } else if (tag.startsWith("exclude:")) {
      const out = new Set(tag.slice(8).split(","));
      all.filter((id) => !out.has(id)).forEach((id) => drawn.add(id));
    }
  }
  return drawn;
}

export function follows(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}
