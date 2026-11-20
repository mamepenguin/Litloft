/**
 * SPEC-CORE-157: the file menu on the Video See all page's cards, and paging after a card
 * leaves. The fake server is stateful, so a page asked for after a removal answers from the
 * list as it now is.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";

import { ToastProvider } from "@/components/ToastProvider";
import { VideoShelfPage } from "../VideoShelfPage";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video/shelf",
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
const getSmartFolders = vi.fn();
const getCollections = vi.fn();
const deleteFile = vi.fn();
const dismissContinueItem = vi.fn();
const deleteWatchProgress = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
  dismissContinueItem: (...args: unknown[]) => dismissContinueItem(...args),
  deleteWatchProgress: (...args: unknown[]) => deleteWatchProgress(...args),
}));

type Params = Record<string, unknown>;

const NEW_TAB = "Open in new tab";
const FILE_ROWS = [NEW_TAB, "Download", "Add to collection", "Copy", "Cut", "Copy ID", "Rename", "Move", "Move to Trash"];
const CONTINUE_ROWS = [...FILE_ROWS.slice(0, 8), "Remove from Continue", "Remove from history", "Move to Trash"];

function item(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "Movies",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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

const server = { continue: [] as string[], folder: [] as string[] };

function answer(_d: string, p: Params) {
  const list = p.by === "watch" ? server.continue : server.folder;
  const size = Number(p.per_shelf ?? 60);
  const start = p.offset !== undefined ? Number(p.offset) : (Number(p.page ?? 1) - 1) * size;
  const items = list.slice(start, start + size).map(item);
  return { by: p.by, total_shelves: 1, base: "", shelves: [{ key: p.key, label: String(p.key), count: list.length, items }] };
}

const forget = (list: string[], id: string) => list.filter((x) => x !== id);

class FakeObserver {
  static instances: FakeObserver[] = [];
  live = true;
  constructor(private callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {
    this.live = false;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
}

function page(by: "watch" | "folder") {
  const shelfKey = by === "watch" ? "continue" : "Movies";
  render(
    <ToastProvider>
      <VideoShelfPage drive={DRIVE} by={by} shelfKey={shelfKey} from="discover" />
    </ToastProvider>,
  );
}

const drawn = () => screen.queryAllByText(/^Video k\d+$/).map((el) => (el.textContent ?? "").replace("Video ", ""));
const rows = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");

async function rightClick(id: string): Promise<boolean> {
  const text = screen.getByText(`Video ${id}`);
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.contextMenu((text.closest("a") as HTMLElement | null) ?? text);
  });
  return notPrevented;
}

async function choose(label: string) {
  const row = await screen.findByRole("menuitem", { name: label });
  await act(async () => {
    fireEvent.pointerDown(row);
    fireEvent.click(row);
  });
}

async function trash(id: string) {
  await rightClick(id);
  await choose("Move to Trash");
  const button = await screen.findByText("submit-trash");
  await act(async () => {
    fireEvent.click(button);
  });
}

async function nextPage() {
  await waitFor(() => expect(FakeObserver.instances.some((o) => o.live)).toBe(true));
  const sentinel = FakeObserver.instances.filter((o) => o.live).at(-1)!;
  act(() => sentinel.trigger());
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`);

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  server.continue = ids(3);
  server.folder = ids(3);
  getShelves.mockReset().mockImplementation(async (d, p) => answer(d, p));
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 1 } });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
    server.folder = forget(server.folder, id);
  });
  dismissContinueItem.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
  deleteWatchProgress.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-157 I1 the See all page's card menu", () => {
  it("SPEC-CORE-157 I1 the Continue See all page offers both history rows, instead of the browser's menu", async () => {
    page("watch");
    await screen.findByText("Video k0");
    const before = getShelves.mock.calls.length;

    expect(await rightClick("k1")).toBe(false);

    expect(rows()).toEqual(CONTINUE_ROWS);
    expect(getShelves.mock.calls.length).toBe(before);
  });

  it("SPEC-CORE-157 I1 a folder See all page offers the file rows without history rows", async () => {
    page("folder");
    await screen.findByText("Video k0");

    expect(await rightClick("k1")).toBe(false);

    expect(rows()).toEqual(FILE_ROWS);
  });

  it("SPEC-CORE-157 I1 without a profile a folder See all card offers the file rows", async () => {
    nickname = null;
    page("folder");
    await screen.findByText("Video k0");

    expect(await rightClick("k1")).toBe(false);

    expect(rows()).toEqual(FILE_ROWS);
  });
});

describe("SPEC-CORE-157 I3 a card leaving the See all grid", () => {
  it.each([
    ["Remove from Continue", dismissContinueItem],
    ["Remove from history", deleteWatchProgress],
  ] as const)("SPEC-CORE-157 I3 %s removes the card in place on the Continue page", async (label, request) => {
    page("watch");
    await screen.findByText("Video k0");

    await rightClick("k1");
    await choose(label);

    await waitFor(() => expect(drawn()).toEqual(["k0", "k2"]));
    expect(request).toHaveBeenCalledWith("k1");
  });

  it("SPEC-CORE-157 I3 trashing the only card shows the grid's empty state", async () => {
    server.folder = ["k0"];
    page("folder");
    await screen.findByText("Video k0");

    await trash("k0");

    expect(await screen.findByText("No files")).toBeInTheDocument();
    expect(drawn()).toEqual([]);
  });
});

describe("SPEC-CORE-157 I4 paging after a removal on See all", () => {
  it("SPEC-CORE-157 I4 after a trash the next page neither skips nor repeats a file compared with a fresh load", async () => {
    server.folder = ids(130);
    page("folder");
    await screen.findByText("Video k0");
    const first = drawn().length;
    expect(first).toBeLessThan(130);

    await trash("k3");
    await waitFor(() => expect(drawn()).not.toContain("k3"));
    await nextPage();
    await waitFor(() => expect(drawn().length).toBeGreaterThan(first - 1));

    const shown = drawn();
    expect(shown).toEqual(server.folder.slice(0, shown.length));
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("SPEC-CORE-157 I4 after Remove from Continue the next Continue page neither skips nor repeats a file", async () => {
    server.continue = ids(130);
    page("watch");
    await screen.findByText("Video k0");
    const first = drawn().length;

    await rightClick("k5");
    await choose("Remove from Continue");
    await waitFor(() => expect(drawn()).not.toContain("k5"));
    await nextPage();
    await waitFor(() => expect(drawn().length).toBeGreaterThan(first - 1));

    const shown = drawn();
    expect(shown).toEqual(server.continue.slice(0, shown.length));
    expect(new Set(shown).size).toBe(shown.length);
  });
});
