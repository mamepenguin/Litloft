import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { ShelfItem } from "@/lib/api";
import { ShelfBlock } from "../ShelfBlock";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onNavigate: _onNavigate,
    ...props
  }: Record<string, unknown>) => (
    <a href={String(href)} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

const item = (id: string): ShelfItem =>
  ({
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    has_thumbnail: false,
    file_size: 1000,
    duration: 120,
    tags: [],
  }) as unknown as ShelfItem;

const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => item(String(index)));

/**
 * jsdom lays nothing out, so the two numbers the component reads off a card
 * slot are stubbed: `offsetTop` by position among the list's children and
 * `offsetHeight` for every slot alike. The layout itself is measured in the
 * layout fixture; these cases hold which slots receive `inert`.
 */
function stubCardLayout(tops: readonly number[], height: number) {
  const topDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetTop",
  );
  const heightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );

  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.tagName !== "LI") return 0;
      const siblings = Array.from(this.parentElement?.children ?? []);
      return tops[siblings.indexOf(this)] ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "LI" ? height : 0;
    },
  });

  return () => {
    if (topDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", topDescriptor);
    }
    if (heightDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetHeight",
        heightDescriptor,
      );
    }
  };
}

/** Three rows of three, 4px of ring room above the first, slot height 184. */
const THREE_ROWS = [4, 4, 4, 200, 200, 200, 396, 396, 396];
const SLOT_HEIGHT = 184;

function renderShelf(seeAllHref: string | undefined, count: number) {
  render(
    <ShelfBlock
      title="A shelf"
      seeAllHref={seeAllHref}
      view={{ status: "loaded", items: cards(count) }}
      onRetry={() => {}}
    />,
  );
  return Array.from(document.querySelectorAll("li")).map((slot) =>
    slot.hasAttribute("inert"),
  );
}

describe("ShelfBlock under a two-row cap", () => {
  it("makes every card from the third row on inert", () => {
    const restore = stubCardLayout(THREE_ROWS, SLOT_HEIGHT);
    try {
      expect(renderShelf("/shelf", 9)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
      ]);
    } finally {
      restore();
    }
  });

  it("leaves a two-row shelf alone", () => {
    const restore = stubCardLayout(THREE_ROWS.slice(0, 6), SLOT_HEIGHT);
    try {
      expect(renderShelf("/shelf", 6)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    } finally {
      restore();
    }
  });

  it("marks nothing on a shelf without a see-all link, however many rows it has", () => {
    const restore = stubCardLayout(THREE_ROWS, SLOT_HEIGHT);
    try {
      expect(renderShelf(undefined, 9)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    } finally {
      restore();
    }
  });
});
