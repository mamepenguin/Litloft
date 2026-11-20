/**
 * SPEC-CORE-157: the file menu on the Reading app's cards — Discover's three shelves and the
 * Continue See all page — and what each menu action does to the lists the page holds.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createPortal } from "react-dom";

import { ToastProvider } from "@/components/ToastProvider";
import { writeAppPrefs } from "@/lib/appPrefs";
import { ReadingApp } from "../ReadingApp";
import { ReadingShelfPage } from "../ReadingShelfPage";

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

vi.mock("@/components/RenameDialog", () => ({
  RenameDialog: ({ open, onRename }: { open: boolean; onRename: (name: string) => unknown }) =>
    open ? <button onClick={() => void onRename("renamed.pdf")}>submit-rename</button> : null,
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
const renameFile = vi.fn();
const dismissContinueItem = vi.fn();
const deleteWatchProgress = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
  renameFile: (...args: unknown[]) => renameFile(...args),
  dismissContinueItem: (...args: unknown[]) => dismissContinueItem(...args),
  deleteWatchProgress: (...args: unknown[]) => deleteWatchProgress(...args),
}));

type Params = Record<string, unknown>;

const NEW_TAB = "Open in new tab";
const FILE_ROWS = [NEW_TAB, "Download", "Add to collection", "Copy", "Cut", "Copy ID", "Rename", "Move", "Move to Trash"];
const CONTINUE_ROWS = [...FILE_ROWS.slice(0, 8), "Remove from Continue", "Remove from history", "Move to Trash"];

const server = {
  continue: [] as string[],
  unread: [] as string[],
  fresh: [] as string[],
  library: [] as string[],
  names: {} as Record<string, string>,
};

const nameOf = (id: string) => server.names[id] ?? `Book ${id}`;

function book(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename: `${id}.pdf`,
    title: nameOf(id),
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
    ...extra,
  };
}

const reading = (id: string) => book(id, { watch_progress: { position: 30, duration: 120 } });

function oneShelf(by: string, key: string, items: unknown[]) {
  return { by, total_shelves: 1, base: "", shelves: [{ key, label: "", count: items.length, items }] };
}

function answerShelves(_d: string, p: Params) {
  if (p.ids !== undefined) {
    const live = new Set([...server.continue, ...server.unread, ...server.fresh, ...server.library]);
    return oneShelf("all", "all", (p.ids as string[]).filter((id) => live.has(id)).map((id) => book(id)));
  }
  if (p.by === "watch" && p.key === "continue") {
    const size = Number(p.per_shelf ?? 12);
    const start = (Number(p.page ?? 1) - 1) * size;
    return oneShelf("watch", "continue", server.continue.slice(start, start + size).map(reading));
  }
  if (p.by === "watch" && p.key === "unwatched") return oneShelf("watch", "unwatched", server.unread.map((id) => book(id)));
  if (p.by === "all") {
    const size = Number(p.per_shelf ?? 60);
    const start = p.offset !== undefined ? Number(p.offset) : (Number(p.page ?? 1) - 1) * size;
    const items = server.library.slice(start, start + size).map((id) => book(id));
    return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: server.library.length, items }] };
  }
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

function answerFiles() {
  return { data: server.fresh.map((id) => book(id)), meta: { total: server.fresh.length, page: 1, limit: 12 } };
}

const forget = (list: string[], id: string) => list.filter((x) => x !== id);

function shelf(heading: string): HTMLElement {
  const section = [...document.querySelectorAll("section")].find(
    (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
  );
  if (!section) throw new Error(`no shelf ${heading}`);
  return section as HTMLElement;
}

function cards(heading: string): string[] {
  const section = [...document.querySelectorAll("section")].find(
    (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
  );
  if (!section) return [];
  return [...section.querySelectorAll("li")]
    .map((li) => li.textContent?.match(/Book [\w-]+/)?.[0] ?? "")
    .filter(Boolean);
}

function card(id: string, heading: string): HTMLElement {
  const text = within(shelf(heading)).getByText(nameOf(id));
  return (text.closest("a") as HTMLElement | null) ?? text;
}

const rows = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");

async function rightClick(target: HTMLElement): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.contextMenu(target);
  });
  return notPrevented;
}

async function choose(label: string) {
  const row = screen.getByRole("menuitem", { name: label });
  await act(async () => {
    fireEvent.pointerDown(row);
    fireEvent.click(row);
  });
}

async function submit(label: string) {
  const button = await screen.findByText(label);
  await act(async () => {
    fireEvent.click(button);
  });
}

function discover() {
  render(
    <ToastProvider>
      <ReadingApp drive={DRIVE} />
    </ToastProvider>,
  );
}

const requests = () => getShelves.mock.calls.length + getDriveFiles.mock.calls.length;
const reReads = () =>
  getShelves.mock.calls
    .map(([, p]) => p as Params)
    .filter((p) => p.by === "all" && Array.isArray(p.ids) && (p.ids as string[]).length === 1);

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

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  server.library = [];
  server.continue = ["c1", "c2"];
  server.unread = ["u1", "c1"];
  server.fresh = ["c1", "f1"];
  server.names = {};
  getShelves.mockReset().mockImplementation(async (d, p) => answerShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => answerFiles());
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
    server.unread = forget(server.unread, id);
    server.fresh = forget(server.fresh, id);
    server.library = forget(server.library, id);
  });
  renameFile.mockReset().mockImplementation(async (id: string) => book(id));
  dismissContinueItem.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
  deleteWatchProgress.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
});

describe("SPEC-CORE-157 I1 the menu on Reading's Discover cards", () => {
  it("SPEC-CORE-157 I1 a Continue reading card offers both history rows, instead of the browser's menu, and sends no request", async () => {
    discover();
    await screen.findByText("Book c2");
    const before = requests();

    expect(await rightClick(card("c1", "Continue reading"))).toBe(false);

    expect(rows()).toEqual(CONTINUE_ROWS);
    expect(requests()).toBe(before);
  });

  it.each(["Not read yet", "New"])("SPEC-CORE-157 I1 a %s card offers the file rows without history rows", async (heading) => {
    discover();
    await screen.findByText("Book c2");

    expect(await rightClick(card("c1", heading))).toBe(false);

    expect(rows()).toEqual(FILE_ROWS);
  });
});

describe("SPEC-CORE-157 I3 actions on Reading's Discover", () => {
  it("SPEC-CORE-157 I3 a trashed book leaves all three shelves in place, with no request", async () => {
    discover();
    await screen.findByText("Book c2");
    const before = requests();

    await rightClick(card("c1", "New"));
    await choose("Move to Trash");
    await submit("submit-trash");

    await waitFor(() => expect(cards("Continue reading")).toEqual(["Book c2"]));
    expect(cards("Not read yet")).toEqual(["Book u1"]);
    expect(cards("New")).toEqual(["Book f1"]);
    expect(deleteFile).toHaveBeenCalledWith("c1");
    expect(requests()).toBe(before);
  });

  it("SPEC-CORE-157 I3 Discover says No books when the last shelf goes through the menu", async () => {
    server.continue = ["c1"];
    server.unread = ["c1"];
    server.fresh = ["c1"];
    discover();
    await screen.findByText("Continue reading");

    await rightClick(card("c1", "Continue reading"));
    await choose("Move to Trash");
    await submit("submit-trash");

    expect(await screen.findByText("No books")).toBeInTheDocument();
  });

  it.each([
    ["Remove from Continue", dismissContinueItem],
    ["Remove from history", deleteWatchProgress],
  ] as const)("SPEC-CORE-157 I3 %s removes the card from Continue reading alone", async (label, request) => {
    discover();
    await screen.findByText("Book c2");

    await rightClick(card("c1", "Continue reading"));
    await choose(label);

    await waitFor(() => expect(cards("Continue reading")).toEqual(["Book c2"]));
    expect(request).toHaveBeenCalledWith("c1");
    expect(cards("Not read yet")).toEqual(["Book u1", "Book c1"]);
    expect(cards("New")).toEqual(["Book c1", "Book f1"]);
  });

  it("SPEC-CORE-157 I6 a failed Remove from Continue keeps the card and shows the error toast", async () => {
    dismissContinueItem.mockRejectedValueOnce(new Error("boom"));
    discover();
    await screen.findByText("Book c2");

    await rightClick(card("c1", "Continue reading"));
    await choose("Remove from Continue");

    expect(await screen.findByText("Could not remove from Continue")).toBeInTheDocument();
    expect(cards("Continue reading")).toEqual(["Book c1", "Book c2"]);
  });

  it("SPEC-CORE-157 I5 after a rename every card for the book redraws in place, and Continue keeps its progress when the answer has none", async () => {
    discover();
    await screen.findByText("Book c2");
    const before = reReads().length;

    await rightClick(card("c1", "New"));
    await choose("Rename");
    server.names.c1 = "Book renamed";
    await submit("submit-rename");

    await waitFor(() => expect(cards("Continue reading")).toEqual(["Book renamed", "Book c2"]));
    expect(cards("Not read yet")).toEqual(["Book u1", "Book renamed"]);
    expect(cards("New")).toEqual(["Book renamed", "Book f1"]);
    expect(reReads().slice(before)).toEqual([{ by: "all", ids: ["c1"] }]);
    const continueCard = card("c1", "Continue reading");
    const li = continueCard.closest("li") as HTMLElement;
    expect(within(li).getByTestId("progress-fill")).toHaveStyle({ width: "25%" });
  });
});

describe("SPEC-CORE-157 I1 I3 Reading's Continue See all page", () => {
  it("SPEC-CORE-157 I1 I3 the Continue page offers both history rows, and Remove from history takes the card out in place", async () => {
    server.continue = ["c1", "c2", "c3"];
    render(
      <ToastProvider>
        <ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" from="discover" />
      </ToastProvider>,
    );
    const target = await screen.findByText("Book c2");

    expect(await rightClick((target.closest("a") as HTMLElement | null) ?? target)).toBe(false);
    expect(rows()).toEqual(CONTINUE_ROWS);
    await choose("Remove from history");

    await waitFor(() => expect(screen.queryByText("Book c2")).toBeNull());
    expect(deleteWatchProgress).toHaveBeenCalledWith("c2");
    expect(screen.getByText("Book c1")).toBeInTheDocument();
    expect(screen.getByText("Book c3")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-157 I4 Reading's ungrouped Library grid", () => {
  const drawnIds = () => screen.queryAllByText(/^Book b\d+$/).map((el) => (el.textContent ?? "").replace("Book ", ""));

  it("SPEC-CORE-157 I4 after a trash the next page neither skips nor repeats a book compared with a fresh load", async () => {
    server.library = Array.from({ length: 130 }, (_, i) => `b${i}`);
    writeAppPrefs(DRIVE, { face: "library" }, "reading");
    discover();
    fireEvent.click(await screen.findByRole("button", { name: /Group By/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "None" }));
    await screen.findByText("Book b0");
    const first = drawnIds().length;
    expect(first).toBeLessThan(130);

    const target = screen.getByText("Book b3");
    await rightClick((target.closest("a") as HTMLElement | null) ?? target);
    await choose("Move to Trash");
    await submit("submit-trash");
    await waitFor(() => expect(drawnIds()).not.toContain("b3"));
    await waitFor(() => expect(FakeObserver.instances.some((o) => o.live)).toBe(true));
    act(() => FakeObserver.instances.filter((o) => o.live).at(-1)!.trigger());
    await waitFor(() => expect(drawnIds().length).toBeGreaterThan(first - 1));

    const shown = drawnIds();
    expect(shown).toEqual(server.library.slice(0, shown.length));
    expect(new Set(shown).size).toBe(shown.length);
  });
});
