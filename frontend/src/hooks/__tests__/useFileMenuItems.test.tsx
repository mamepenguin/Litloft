/**
 * The file menu is one list, wherever it opens.
 *
 * It used to be three: the card grid's (`FileContextMenu`), the list
 * view's (built inline in `FileList`, with no "open in new tab"), and
 * the detail page's (`FileActions`, with no "add to collection" at
 * all). Right-clicking the same file in two views offered two different
 * sets of things to do with it, and nothing said which was right.
 *
 * The assertions below are about agreement between surfaces rather than
 * about any one surface's list, because a shared definition that two
 * callers then filter differently would pass a per-surface check.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
}));

import { useFileMenuItems, type FileMenuContext } from "../useFileMenuItems";
import type { FileItem } from "@/types";

const file = {
  id: "f1",
  filename: "notes.md",
  title: "notes",
  description: "",
  drive: "work",
  folder_path: "",
  file_type: "document",
  mime_type: "text/markdown",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 10,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as FileItem;

/** The handlers every surface supplies. */
const base: FileMenuContext = {
  onAddToCollection: vi.fn(),
  onRename: vi.fn(),
  onMove: vi.fn(),
  onTrash: vi.fn(),
};

const labelsFor = (ctx: FileMenuContext, f: FileItem = file) =>
  renderHook(() => useFileMenuItems(f, ctx)).result.current.map((i) => i.label);

/** What each of the three surfaces passes today. */
const CARD: FileMenuContext = { ...base, onOpenInNewTab: vi.fn() };
const LIST: FileMenuContext = base;
const DETAIL: FileMenuContext = { ...base, onEdit: vi.fn() };

/** Entries a surface adds because of where it is, not what the file is. */
const CONTEXTUAL = ["Open in new tab", "Edit", "Remove from history"];
const shared = (ctx: FileMenuContext) =>
  labelsFor(ctx).filter((l) => !CONTEXTUAL.includes(l));

describe("the file actions menu", () => {
  it("offers the same things on a card, in a list and on the detail page", () => {
    expect(shared(LIST)).toEqual(shared(CARD));
    expect(shared(DETAIL)).toEqual(shared(CARD));
  });

  it("includes add-to-collection everywhere, which the detail page lacked", () => {
    for (const ctx of [CARD, LIST, DETAIL]) {
      expect(labelsFor(ctx)).toContain("Add to collection");
    }
  });

  it("keeps one order, so the same action is in the same place", () => {
    expect(shared(CARD)).toEqual([
      "Download",
      "Add to collection",
      "Copy",
      "Cut",
      "Rename",
      "Move",
      "Move to Trash",
    ]);
  });

  it("adds the contextual entries only where the surface offers them", () => {
    expect(labelsFor(CARD)[0]).toBe("Open in new tab");
    expect(labelsFor(DETAIL)[0]).toBe("Edit");
    expect(labelsFor(LIST)).not.toContain("Open in new tab");
    expect(labelsFor(LIST)).not.toContain("Edit");
  });

  it("puts the history entry last but one, above the destructive row", () => {
    const withHistory = labelsFor({ ...base, onRemoveFromHistory: vi.fn() });
    expect(withHistory.at(-2)).toBe("Remove from history");
    expect(withHistory.at(-1)).toBe("Move to Trash");
  });

  it("greys the entries a missing file cannot answer, and keeps the rest", () => {
    // The bytes are gone but the row, its tags and its history are not.
    // Streaming answers 410 and a copied path leads nowhere, so those
    // rows go inert rather than disappearing — the menu keeps its shape
    // and nothing shifts under the pointer.
    const missing = { ...file, missing_since: "2026-09-01T00:00:00Z" } as FileItem;
    const items = renderHook(() => useFileMenuItems(missing, base)).result.current;
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i.disabled ?? false]));

    expect(byLabel["Download"]).toBe(true);
    expect(byLabel["Copy"]).toBe(true);
    expect(byLabel["Cut"]).toBe(true);
    // Renaming, moving and trashing act on the row, which still exists.
    expect(byLabel["Rename"]).toBe(false);
    expect(byLabel["Move"]).toBe(false);
    expect(byLabel["Move to Trash"]).toBe(false);
    // Nothing was removed.
    expect(items.map((i) => i.label)).toEqual(labelsFor(base));
  });

  it("offers nothing without a file", () => {
    expect(labelsFor(base, null as unknown as FileItem)).toEqual([]);
  });
});
