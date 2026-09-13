import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key}:${Object.values(values).join(",")}` : `${namespace}.${key}`;
    return t;
  },
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/thumb/${id}`,
}));

vi.mock("@/hooks/useRelativeDate", () => ({
  useRelativeDate: () => () => "recently",
}));

vi.mock("@/lib/cardGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cardGrid")>();
  return { ...actual, useCardColumns: () => 4 };
});

import { TrashFileGrid } from "../trash/TrashFileGrid";
import { TrashFileList } from "../trash/TrashFileList";
import { MissingFileGrid } from "../missing/MissingFileGrid";
import { MissingFileList } from "../missing/MissingFileList";

const titles = [
  "旧_打ち合わせメモ",
  "Quarterly plan",
  "旧_打ち合わせメモ (1)",
  "holiday.mp4",
  "notes.md",
];

const files = titles.map((title, i) => ({
  id: `f${i}`,
  filename: `${title}.bin`,
  title,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "document",
  mime_type: "application/pdf",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024,
  duration: 0,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: "2026-08-01T00:00:00Z",
  missing_since: "2026-08-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
})) as never[];

const GRIDS = [
  ["trash grid", (selectable: boolean) => (
    <TrashFileGrid files={files} selectable={selectable} onRestore={vi.fn()} onPurge={vi.fn()} />
  )],
  ["missing grid", (selectable: boolean) => (
    <MissingFileGrid files={files} selectable={selectable} onPurge={vi.fn()} />
  )],
] as const;

const SURFACES = [
  ["trash grid", () => <TrashFileGrid files={files} onRestore={vi.fn()} onPurge={vi.fn()} />],
  ["trash list", () => <TrashFileList files={files} onRestore={vi.fn()} onPurge={vi.fn()} />],
  ["missing grid", () => <MissingFileGrid files={files} onPurge={vi.fn()} />],
  ["missing list", () => <MissingFileList files={files} onPurge={vi.fn()} />],
] as const;

function rowActionNames(): string[] {
  return screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
}

afterEach(cleanup);

describe.each(SURFACES)("%s", (_name, renderSurface) => {
  it("names each action after the row it acts on", () => {
    render(renderSurface());
    const names = rowActionNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        titles.some((t) => name.includes(t)),
        `"${name}" names no row`,
      ).toBe(true);
    }
    for (const title of titles) {
      expect(names.some((n) => n.includes(title))).toBe(true);
    }
  });

  /**
   * Two files sharing a title in different folders still collide, because the
   * name interpolates the title alone; that narrowing is accepted.
   */
  it("gives no two actions the same name", () => {
    render(renderSurface());
    const names = rowActionNames();
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * With an `aria-label` present, `title` becomes the accessible description,
   * so setting both to the same string has it announced twice.
   */
  it("does not repeat the name in a title attribute", () => {
    render(renderSurface());
    for (const button of screen.getAllByRole("button")) {
      const label = button.getAttribute("aria-label");
      if (!label) continue;
      expect(button.getAttribute("title")).not.toBe(label);
    }
  });
});

/**
 * The strip is in flow, so unmounting it when selection starts would reflow
 * the grid under the pointer; `visibility: hidden` keeps the box and still
 * drops the tab stop.
 */
describe.each(GRIDS)("%s in selection mode", (_name, renderGrid) => {
  it("keeps the action strip's box, and takes it out of the tab order", () => {
    const { container, rerender } = render(renderGrid(false));
    const strip = container.querySelector('[class*="mt-2 flex flex-wrap"]');
    expect(strip).not.toBeNull();
    expect(strip!.className).not.toContain("invisible");

    rerender(renderGrid(true));
    const inSelection = container.querySelector('[class*="mt-2 flex flex-wrap"]');
    expect(inSelection, "the strip was unmounted, which reflows the grid").not.toBeNull();
    expect(inSelection!.className).toContain("invisible");
  });
});
