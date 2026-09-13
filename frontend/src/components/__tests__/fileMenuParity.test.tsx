/**
 * These render the actual components and read the actual menus, which is
 * the only way the claim "they agree" can be false.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

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
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

vi.mock("@/hooks/useShortcuts", () => ({
  useShortcuts: () => {},
}));

import { FileList } from "../FileList";
import { FileActions } from "../FileActions";
import { FileGrid } from "../FileGrid";
import type { FileItem, FileItemWithMatch } from "@/types";

const file = {
  id: "f1",
  filename: "notes.md",
  title: "Notes",
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
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as FileItem;

const labels = () =>
  screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());

function listMenu(): (string | undefined)[] {
  render(<FileList files={[file as FileItemWithMatch]} />);
  fireEvent.contextMenu(screen.getAllByText("Notes")[0]);
  const out = labels();
  cleanup();
  return out;
}

function cardMenu(): (string | undefined)[] {
  render(<FileGrid files={[file as FileItemWithMatch]} />);
  fireEvent.contextMenu(screen.getAllByText("Notes")[0]);
  const out = labels();
  cleanup();
  return out;
}

function detailMenu(): (string | undefined)[] {
  render(<FileActions file={file} />);
  fireEvent.click(screen.getByLabelText("File actions"));
  const out = labels();
  cleanup();
  return out;
}

/** Entries a surface adds because of where it is, not what the file is. */
const CONTEXTUAL = ["Open in new tab", "Edit", "Remove from history"];
const withoutContextual = (l: (string | undefined)[]) =>
  l.filter((label) => !CONTEXTUAL.includes(label ?? ""));

describe("the file actions menu, across the three surfaces that draw it", () => {
  it("offers the same actions in the same order", () => {
    const list = withoutContextual(listMenu());
    const card = withoutContextual(cardMenu());
    const detail = withoutContextual(detailMenu());

    expect(list).toEqual(card);
    expect(detail).toEqual(card);
  });

  it("offers all of them, not an accidentally empty intersection", () => {
    expect(withoutContextual(cardMenu())).toEqual([
      "Download",
      "Add to collection",
      "Copy",
      "Cut",
      "Rename",
      "Move",
      "Move to Trash",
    ]);
  });

  it("gives the detail page add-to-collection, which it used to lack", () => {
    expect(detailMenu()).toContain("Add to collection");
  });
});
