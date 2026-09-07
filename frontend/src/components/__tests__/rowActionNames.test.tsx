import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * A name per row, not per control (DESIGN.md §Row Actions).
 *
 * The trash and missing views draw thirty of these at a time and every
 * one of them was called "Restore" or "Permanently delete". A screen
 * reader user tabbing the page hears the same two words over and over
 * with nothing saying which file is about to be deleted for good.
 *
 * All four surfaces are rendered from the same fixture, because the
 * defect was in all four and a test that covers one of them would have
 * been satisfied by the first fix.
 */

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

/** Five, because "no two names collide" is trivially true of one row. */
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

/**
 * Every button these four surfaces render — no filter.
 *
 * The first version of this kept only labels matching `/Named:/`, which is
 * to say only the buttons that were *already correct*. A button that
 * regressed to the shared name fell out of the population before any
 * assertion saw it, and on the two trash surfaces the other action's five
 * distinct names kept every test green. Reverting `restoreNamed` to
 * `restore` — five buttons on screen all called "Restore", the exact
 * defect this file is named for — left 12/12 passing.
 *
 * A population must not be filtered by a pattern that means "already
 * satisfies the property under test". These surfaces render nothing but
 * their row actions, so the population is simply all of them.
 */
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
    // Every one of them, not merely one per title: an action that dropped
    // back to the shared name is still in this list, and this is where it
    // is seen.
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
   * Titles are unique in this fixture, so the names are too. Two trashed
   * files that share a title — two `README.md` in different folders — do
   * still collide, because the name interpolates the title alone. That is
   * an accepted narrowing rather than an oversight: it is thirty-way
   * ambiguity reduced to two-way, the trash lists a whole drive so the
   * case is reachable, and resolving it means putting a folder path into
   * a button's name. Recorded so the property this file claims is not
   * read as wider than it is.
   */
  it("gives no two actions the same name", () => {
    render(renderSurface());
    const names = rowActionNames();
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * §Row Actions: with an `aria-label` present, `title` becomes the
   * accessible *description*, which NVDA and JAWS read after the name —
   * so setting both to the same string has the sentence announced twice.
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
 * In the footer the action strip is in flow, so whether it is *mounted*
 * is a layout question and not only a visibility one.
 *
 * Selection starts with a Cmd/Ctrl-click on a card, so unmounting the
 * strip at that moment takes ~40px off every card in the grid at once and
 * the whole thing jumps under the pointer that just aimed at it.
 * `visibility: hidden` keeps the box and still drops the tab stop.
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
