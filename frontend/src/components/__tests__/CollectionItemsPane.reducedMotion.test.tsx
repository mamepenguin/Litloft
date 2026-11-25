/**
 * SPEC-CORE-179 I4 — collection rows snap to their new places under reduced
 * motion, and the layout they snapped to is the one the next glide starts from.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { CollectionItemsPane } from "../CollectionItemsPane";
import type { CollectionItemEntry, FileItem } from "@/types";

vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: null, selectFile: vi.fn(), clearFile: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

const ROW = 48;

function makeFile(id: string): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.md`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
    modified_at: null,
  };
}

const entries: Record<string, CollectionItemEntry> = {
  a: { id: 1, position: 0, file: makeFile("a") },
  b: { id: 2, position: 0, file: makeFile("b") },
  c: { id: 3, position: 0, file: makeFile("c") },
  d: { id: 4, position: 0, file: makeFile("d") },
};

function list(...ids: string[]): CollectionItemEntry[] {
  return ids.map((id, position) => ({ ...entries[id], position }));
}

const handlers = { onMoveUp: vi.fn(), onMoveDown: vi.fn(), onRemove: vi.fn() };

let reduced = false;
let animated: Element[] = [];
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const originalRect = Element.prototype.getBoundingClientRect;
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

/** jsdom lays nothing out, so a row's box is its place in its list. */
function rowBox(el: Element): DOMRect {
  const row = el.closest("li");
  const index = row?.parentElement
    ? Array.from(row.parentElement.children).indexOf(row)
    : 0;
  const top = index * ROW;
  return {
    x: 0,
    y: top,
    left: 0,
    top,
    right: 300,
    bottom: top + ROW,
    width: 300,
    height: ROW,
    toJSON: () => ({}),
  } as DOMRect;
}

function rowsAnimated(): string[] {
  return animated
    .map((el) => (el.closest("li") ?? el).textContent ?? "")
    .map((text) => /File ([a-z])/.exec(text)?.[1] ?? "?")
    .sort();
}

beforeEach(() => {
  reduced = false;
  animated = [];
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rowBox(this);
  };
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: function (this: Element) {
      animated.push(this);
      return {
        finished: Promise.resolve(),
        cancel: () => {},
        finish: () => {},
        onfinish: null,
        oncancel: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as Animation;
    },
  });
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete (Element.prototype as Partial<Element>).animate;
  if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
  else delete (window as Partial<Window>).matchMedia;
});

describe("SPEC-CORE-179 I4 collection rows under reduced motion", () => {
  it("SPEC-CORE-179 I4 calls Element.animate zero times for a reorder under reduced motion", () => {
    reduced = true;
    const view = render(<CollectionItemsPane items={list("a", "b", "c")} {...handlers} />);
    view.rerender(<CollectionItemsPane items={list("c", "a", "b")} {...handlers} />);
    expect(animated).toEqual([]);
  });

  it("SPEC-CORE-179 I4 calls Element.animate zero times for an add under reduced motion", () => {
    reduced = true;
    const view = render(<CollectionItemsPane items={list("a", "b", "c")} {...handlers} />);
    view.rerender(<CollectionItemsPane items={list("d", "a", "b", "c")} {...handlers} />);
    expect(animated).toEqual([]);
  });

  it("SPEC-CORE-179 I4 calls Element.animate zero times for a remove under reduced motion", () => {
    reduced = true;
    const view = render(<CollectionItemsPane items={list("a", "b", "c")} {...handlers} />);
    view.rerender(<CollectionItemsPane items={list("b", "c")} {...handlers} />);
    expect(animated).toEqual([]);
  });

  it("SPEC-CORE-179 I4 glides the first change after reduced motion is turned off from the layout the snapped change left", () => {
    reduced = true;
    const view = render(<CollectionItemsPane items={list("a", "b", "c")} {...handlers} />);
    view.rerender(<CollectionItemsPane items={list("b", "a", "c")} {...handlers} />);
    expect(animated).toEqual([]);

    reduced = false;
    view.rerender(<CollectionItemsPane items={list("b", "c", "a")} {...handlers} />);
    // From [b, a, c]: b stays put, a and c trade places. Measured from the
    // stale [a, b, c] instead, b would move too.
    expect(rowsAnimated()).toEqual(["a", "c"]);
  });
});
