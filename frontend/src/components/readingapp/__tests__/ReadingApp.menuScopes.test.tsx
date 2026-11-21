/**
 * The Reading app's file menu only opens on a single book, and a touch press
 * held without moving opens it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";

import { ToastProvider } from "@/components/ToastProvider";
import { writeAppPrefs } from "@/lib/appPrefs";
import { ReadingApp } from "../ReadingApp";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
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

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => unknown }) =>
    open ? createPortal(<button onClick={() => void onConfirm()}>submit-trash</button>, document.body) : null,
}));

vi.mock("@/components/CollectionPicker", () => ({ CollectionPicker: () => null }));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
}));

type Params = Record<string, unknown>;

function book(id: string) {
  return {
    id,
    filename: `${id}.pdf`,
    title: `Book ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function oneShelf(by: string, key: string, items: unknown[]) {
  return { by, total_shelves: 1, base: "", shelves: [{ key, label: "", count: items.length, items }] };
}

function answerShelves(_d: string, p: Params) {
  if (p.by === "watch" && p.key === "continue") return oneShelf("watch", "continue", [book("c1")]);
  if (p.by === "watch" && p.key === "unwatched") return oneShelf("watch", "unwatched", [book("u1")]);
  if (p.by === "folder") return oneShelf("folder", "Books", [book("u1")]);
  return oneShelf("all", "all", [book("f1")]);
}

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

async function visit() {
  render(
    <ToastProvider>
      <ReadingApp drive={DRIVE} />
    </ToastProvider>,
  );
  await screen.findByText("Book f1");
}

function noFileMenu() {
  expect(screen.queryByRole("menuitem", { name: "Open in new tab" })).toBeNull();
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  getShelves.mockReset().mockImplementation(async (d, p) => answerShelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [book("f1")], meta: { total: 1, page: 1, limit: 12 } });
});

describe("the Reading app's non-file elements", () => {
  it("a folder chip, the name filter and the tabs leave the browser's menu alone", async () => {
    writeAppPrefs(DRIVE, { face: "library" }, "reading");
    await visit();
    await screen.findByText("Book f1");

    const chip = screen.getByRole("button", { name: "Books" });
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.contextMenu(chip);
    });
    expect(notPrevented).toBe(true);
    noFileMenu();

    const nameIcon = screen.getByRole("button", { name: "Filter by name" });
    act(() => {
      notPrevented = fireEvent.contextMenu(nameIcon);
    });
    expect(notPrevented).toBe(true);
    noFileMenu();

    act(() => {
      notPrevented = fireEvent.contextMenu(screen.getByRole("tab", { name: "Discover" }));
    });
    expect(notPrevented).toBe(true);
    noFileMenu();
  });
});

describe("the Reading card's long press", () => {
  it("a 500 ms press opens the file menu", async () => {
    await visit();
    const text = screen.getByText("Book f1");

    await act(async () => {
      fireEvent.touchStart(text, { touches: [{ clientX: 5, clientY: 5 }] });
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(screen.getByRole("menuitem", { name: "Open in new tab" })).toBeInTheDocument();
  });
});
