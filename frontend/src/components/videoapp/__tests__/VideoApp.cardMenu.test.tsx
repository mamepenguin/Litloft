/**
 * SPEC-CORE-157: the file menu on the Video app's cards — Discover's shelves and the
 * Library grid — and what each menu action does to the lists the page holds.
 *
 * The server is a stateful fake: trash, set-aside and history removal change what a later
 * request answers, so a list that is fetched again shows the truth while a held list has
 * to be changed in place. The dialogs are stubbed with a button that submits them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createPortal } from "react-dom";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import {
  PICKUP,
  advance,
  deferred,
  flush,
  freshDrive,
  item,
  layout,
  restricting,
  shelfCards,
  silent,
  title,
  useFakeClock,
  type Entry,
  type Params,
  type Provider,
} from "./discoverHarness";

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 24 }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { catalogue, intel, intelActions } = vi.hoisted(() => ({
  catalogue: {
    loading: false,
    catalogueDrive: "" as string | null | undefined,
    slots: {} as Record<string, Entry[]>,
  },
  intel: {} as Record<string, unknown>,
  intelActions: {} as Record<string, unknown>,
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => {
    const slots = Object.fromEntries(
      Object.entries(catalogue.slots).map(([slot, entries]) => [slot, entries.map((e) => ({ ...e }))]),
    );
    return {
      addons: {},
      catalogueDrive: catalogue.catalogueDrive,
      slots,
      loading: catalogue.loading,
      getSlotEntries: (id: string) => slots[id] ?? [],
      hasSlot: (id: string) => (slots[id] ?? []).length > 0,
    };
  },
  useAddonStatus: () => ({ features: {} }),
}));

vi.mock("@/addons/intelligence/slots.ts", () => ({
  slotComponents: {},
  slotProviders: intel,
  slotItemActions: intelActions,
}));
vi.mock("@/addons/media_import/slots.ts", () => ({ slotComponents: {}, slotProviders: {} }));
vi.mock("@/addons/knowledge/slots.ts", () => ({ slotComponents: {} }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/d/apps/video",
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

const copyText = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/copyText", () => ({ copyText: (text: string) => copyText(text) }));

vi.mock("@/components/RenameDialog", () => ({
  RenameDialog: ({ open, onRename }: { open: boolean; onRename: (name: string) => unknown }) =>
    open ? <button onClick={() => void onRename("renamed.mp4")}>submit-rename</button> : null,
}));

vi.mock("@/components/MoveDialog", () => ({
  MoveDialog: ({ open, onMove }: { open: boolean; onMove: (path: string) => unknown }) =>
    open ? <button onClick={() => void onMove("Elsewhere")}>submit-move</button> : null,
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
const moveFile = vi.fn();
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
  moveFile: (...args: unknown[]) => moveFile(...args),
  dismissContinueItem: (...args: unknown[]) => dismissContinueItem(...args),
  deleteWatchProgress: (...args: unknown[]) => deleteWatchProgress(...args),
}));

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const intelligenceLinked = (() => {
  const dir = resolve(SRC, "addons", "intelligence");
  return existsSync(dir) && readdirSync(dir).length > 0;
})();

const NEW_TAB = "Open in new tab";
const FILE_ROWS = [NEW_TAB, "Download", "Add to collection", "Copy", "Cut", "Copy ID", "Rename", "Move", "Move to Trash"];
const CONTINUE_ROWS = [...FILE_ROWS.slice(0, 8), "Remove from Continue", "Remove from history", "Move to Trash"];
const ACTION = "Not interested";
const UNDO = "Undo";
const DIVIDER = "---";

/** What the fake server holds. A list request answers from it at the moment it is asked. */
const server = {
  continue: [] as string[],
  all: [] as string[],
  names: {} as Record<string, string>,
};

let drive = "";

const nameOf = (id: string) => server.names[id] ?? title(id);
const asItem = (id: string, extra: Record<string, unknown> = {}) => ({ ...item(id, nameOf(id), drive), ...extra });
const continueItem = (id: string) => asItem(id, { watch_progress: { position: 30, duration: 120 } });

function slice(ids: string[], p: Params): string[] {
  const size = Number(p.per_shelf ?? p.limit ?? ids.length);
  const start = p.offset !== undefined ? Number(p.offset) : (Number(p.page ?? 1) - 1) * size;
  return ids.slice(start, start + size);
}

function answerShelves(_d: string, p: Params) {
  if (p.ids !== undefined) {
    const live = new Set([...server.all, ...server.continue]);
    const items = (p.ids as string[]).filter((id) => live.has(id)).map((id) => asItem(id));
    return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
  }
  if (p.by === "watch" && p.key === "continue") {
    const items = slice(server.continue, p).map(continueItem);
    return { by: "watch", total_shelves: 1, base: "", shelves: [{ key: "continue", label: "", count: server.continue.length, items }] };
  }
  if (p.by === "all") {
    const items = slice(server.all, p).map((id) => asItem(id));
    return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: server.all.length, items }] };
  }
  if (p.by === "folder") {
    const items = server.all.slice(0, Number(p.per_shelf ?? 5)).map((id) => asItem(id));
    return { by: "folder", total_shelves: 1, base: "", shelves: [{ key: "Movies", label: "Movies", count: server.all.length, items }] };
  }
  return { by: p.by, total_shelves: 0, base: "", shelves: [] };
}

function answerFiles(_d: string, p: Params) {
  const items = slice(server.all, { limit: p.limit ?? 12, page: p.page ?? 1 }).map((id) => asItem(id));
  return { data: items, meta: { total: server.all.length, page: Number(p.page ?? 1), limit: Number(p.limit ?? 12) } };
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

function declare(slots: { recommended?: Entry[]; shelves?: Entry[] }) {
  catalogue.slots = {
    ...(slots.recommended ? { "video-discover-recommended": slots.recommended } : {}),
    ...(slots.shelves ? { "video-discover-shelves": slots.shelves } : {}),
  };
}

function app(onDrive = drive) {
  return (
    <ToastProvider>
      <VideoApp drive={onDrive} />
    </ToastProvider>
  );
}

async function visit(onDrive = drive) {
  const view = render(app(onDrive));
  await flush();
  return view;
}

function shelf(heading: string): HTMLElement {
  const section = [...document.querySelectorAll("section")].find(
    (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
  );
  if (!section) throw new Error(`no shelf ${heading}`);
  return section as HTMLElement;
}

/** The card for `id` inside the shelf headed `heading`, or anywhere when no heading is given. */
function card(id: string, heading?: string): HTMLElement {
  const root = heading ? within(shelf(heading)) : screen;
  const text = root.getByText(nameOf(id));
  return (text.closest("a") as HTMLElement | null) ?? text;
}

/** Right-clicks the card; true when the browser's own menu was left alone. */
async function rightClick(target: HTMLElement): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.contextMenu(target);
  });
  await flush();
  return notPrevented;
}

const rows = () => screen.queryAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");

/** Menu rows and dividers in document order, a divider as `---`. */
function sequence(): string[] {
  const menu = screen.queryByRole("menu");
  if (!menu) return [];
  return [...menu.querySelectorAll('[role="menuitem"], [role="separator"]')].map((el) =>
    el.getAttribute("role") === "separator" ? DIVIDER : el.textContent?.trim() ?? "",
  );
}

async function choose(label: string) {
  const row = screen.getByRole("menuitem", { name: label });
  await act(async () => {
    fireEvent.pointerDown(row);
    fireEvent.click(row);
  });
  await flush();
}

/** The menu opens a dialog a few clock ticks after its row is chosen. */
async function submit(label: string) {
  for (let waited = 0; !screen.queryByText(label) && waited < 500; waited += 10) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }
  await act(async () => {
    fireEvent.click(screen.getByText(label));
  });
  await flush();
}

async function trash(target: HTMLElement) {
  await rightClick(target);
  await choose("Move to Trash");
  await submit("submit-trash");
}

async function rename(target: HTMLElement) {
  await rightClick(target);
  await choose("Rename");
  await submit("submit-rename");
}

const requests = () => getShelves.mock.calls.length + getDriveFiles.mock.calls.length;
const reReads = () =>
  getShelves.mock.calls
    .map(([, p]) => p as Params)
    .filter((p) => p.by === "all" && Array.isArray(p.ids) && (p.ids as string[]).length === 1);

const restrictCalls = () =>
  getShelves.mock.calls.map(([, p]) => p as Params).filter((p) => p.ids !== undefined);
const idsSince = (from: number) => restrictCalls().slice(from).map((p) => p.ids as string[]);

function toast(kind: "status" | "alert", text: string): HTMLElement | null {
  const el = screen.queryByText(text);
  return (el?.closest(`[role="${kind}"]`) as HTMLElement | null) ?? null;
}

async function openFace(name: "Library" | "Discover") {
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
  await flush();
}

beforeEach(() => {
  useFakeClock();
  drive = freshDrive();
  nickname = "alice";
  localStorage.clear();
  sessionStorage.clear();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  catalogue.loading = false;
  catalogue.catalogueDrive = drive;
  catalogue.slots = {};
  for (const bag of [intel, intelActions]) for (const k of Object.keys(bag)) delete bag[k];
  server.continue = ["c1", "c2"];
  server.all = ["c1", "n1", "n2"];
  server.names = {};
  getShelves.mockReset().mockImplementation(async (d, p) => answerShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => answerFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockImplementation(async (id: string) => {
    server.all = forget(server.all, id);
    server.continue = forget(server.continue, id);
  });
  dismissContinueItem.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
  deleteWatchProgress.mockReset().mockImplementation(async (id: string) => {
    server.continue = forget(server.continue, id);
  });
  renameFile.mockReset().mockImplementation(async (id: string, name: string) => {
    server.names[id] = `Vid ${name.replace(/\.mp4$/, "")}`;
    return asItem(id);
  });
  moveFile.mockReset().mockImplementation(async (id: string) => asItem(id, { folder_path: "Elsewhere" }));
  copyText.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SPEC-CORE-157 I1 the menu on Discover's cards", () => {
  it("SPEC-CORE-157 I1 a Continue card opens the file menu with both history rows, instead of the browser's menu, and sends no request", async () => {
    await visit();
    const before = requests();

    const browserMenu = await rightClick(card("c1", "Continue"));

    expect(browserMenu).toBe(false);
    expect(rows()).toEqual(CONTINUE_ROWS);
    expect(requests()).toBe(before);
    for (const write of [deleteFile, renameFile, moveFile, dismissContinueItem, deleteWatchProgress]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("SPEC-CORE-157 I1 a New card opens the file menu without history rows, even for a file that is also on Continue", async () => {
    await visit();

    expect(await rightClick(card("c1", "New"))).toBe(false);

    expect(rows()).toEqual(FILE_ROWS);
  });

  it("SPEC-CORE-157 I1 without a profile a card opens the file rows and no history rows", async () => {
    nickname = null;
    await visit();

    expect(await rightClick(card("n1", "New"))).toBe(false);

    expect(rows()).toEqual(FILE_ROWS);
  });

  it("SPEC-CORE-157 I1 the menu targets the pressed card's file, and a right-click on another card moves the one menu there", async () => {
    await visit();

    await rightClick(card("c1", "Continue"));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    await rightClick(card("n2", "New"));

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(rows()).toEqual(FILE_ROWS);
    await choose("Copy ID");
    expect(copyText).toHaveBeenCalledWith("n2");
  });

  it("SPEC-CORE-157 I1 Open in new tab opens the card's own link", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await visit();
    const href = card("n1", "New").getAttribute("href");

    await rightClick(card("n1", "New"));
    await choose(NEW_TAB);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(href);
    expect(open.mock.calls[0][1]).toBe("_blank");
  });

  it("SPEC-CORE-157 I1 a shelf heading leaves the browser's menu alone while a card on that shelf does not", async () => {
    await visit();
    const heading = within(shelf("New")).getByText("New");

    expect(await rightClick(heading)).toBe(true);
    expect(rows()).toEqual([]);

    expect(await rightClick(card("n1", "New"))).toBe(false);
    expect(rows()).toEqual(FILE_ROWS);
  });

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I1 SPEC-CORE-150 I7 as revised a Recommended card with actions opens the actions, one divider, then the same menu a New card opens",
    async () => {
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: "m" }) }];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["n1"]);
      await visit();

      await rightClick(card("n1", "New"));
      const plain = sequence();
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await flush();
      await rightClick(card("n1", "Recommended"));

      expect(plain.filter((r) => r !== DIVIDER)).toEqual(FILE_ROWS);
      expect(sequence()).toEqual([ACTION, DIVIDER, ...plain]);
    },
  );
});

describe("SPEC-CORE-157 I2 the long press on a Discover card", () => {
  it("SPEC-CORE-157 I2 a 500 ms press opens the menu and swallows the click that ends it; a press that moves opens nothing and its click navigates", async () => {
    await visit();

    await act(async () => {
      fireEvent.touchStart(card("n2", "New"), { touches: [{ clientX: 5, clientY: 5 }] });
      fireEvent.touchMove(card("n2", "New"), { touches: [{ clientX: 60, clientY: 5 }] });
    });
    await advance(600);
    expect(rows()).toEqual([]);
    let movedClick = false;
    await act(async () => {
      fireEvent.touchEnd(card("n2", "New"));
      movedClick = fireEvent.click(card("n2", "New"));
    });
    expect(movedClick).toBe(true);

    await act(async () => {
      fireEvent.touchStart(card("n1", "New"), { touches: [{ clientX: 5, clientY: 5 }] });
    });
    await advance(500);
    expect(rows()).toEqual(FILE_ROWS);
    let followingClick = true;
    await act(async () => {
      fireEvent.touchEnd(card("n1", "New"));
      followingClick = fireEvent.click(card("n1", "New"));
    });
    expect(followingClick).toBe(false);
  });
});

describe("SPEC-CORE-157 I3 trash from Discover", () => {
  it("SPEC-CORE-157 I3 every card for the id leaves every shelf in place, with no request, no skeleton and no Undo", async () => {
    await visit();
    expect(shelfCards("Continue")).toEqual([title("c1"), title("c2")]);
    expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);
    const before = requests();

    await trash(card("c1", "New"));

    expect(deleteFile).toHaveBeenCalledWith("c1");
    expect(shelfCards("Continue")).toEqual([title("c2")]);
    expect(shelfCards("New")).toEqual([title("n1"), title("n2")]);
    expect(requests()).toBe(before);
    expect(document.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByRole("button", { name: UNDO })).toBeNull();
  });

  it("SPEC-CORE-157 I3 SPEC-CORE-076 I1 as revised a shelf whose last card is trashed disappears", async () => {
    server.continue = ["c1"];
    await visit();
    expect(layout()).toEqual(["Continue", "New"]);

    await trash(card("c1", "Continue"));

    expect(layout()).toEqual(["New"]);
  });

  it("SPEC-CORE-157 I3 SPEC-CORE-076 I9 as revised Discover shows No files when the last shelf goes through the menu", async () => {
    server.continue = ["c1"];
    server.all = ["c1"];
    await visit();
    expect(screen.queryByText("No files")).toBeNull();

    await trash(card("c1", "New"));

    expect(layout()).toEqual([]);
    expect(screen.getByText("No files")).toBeInTheDocument();
  });

  it("SPEC-CORE-157 I3 the card is not drawn again after Discover → Library → Discover", async () => {
    await visit();
    await trash(card("n1", "New"));
    expect(shelfCards("New")).toEqual([title("c1"), title("n2")]);

    await openFace("Library");
    await openFace("Discover");

    expect(shelfCards("New")).toEqual([title("c1"), title("n2")]);
  });

  it("SPEC-CORE-157 I3 a Library list held while Discover is shown loses the trashed file too", async () => {
    writeAppPrefs(drive, { face: "library" });
    await visit();
    expect(screen.getAllByText(title("n1")).length).toBeGreaterThan(0);
    await openFace("Discover");

    await trash(card("n1", "New"));
    await openFace("Library");

    expect(screen.queryByText(title("n1"))).toBeNull();
  });

  it("SPEC-CORE-157 I6 a trash that fails leaves every shelf as drawn; trying again removes the card", async () => {
    deleteFile.mockRejectedValueOnce(new Error("boom"));
    await visit();

    await trash(card("n1", "New"));
    expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);
    expect(screen.getByText("submit-trash")).toBeInTheDocument();

    await submit("submit-trash");
    expect(shelfCards("New")).toEqual([title("c1"), title("n2")]);
  });
});

describe("SPEC-CORE-157 I3 the history rows on Continue", () => {
  it.each([
    ["Remove from Continue", dismissContinueItem],
    ["Remove from history", deleteWatchProgress],
  ] as const)(
    "SPEC-CORE-157 I3 I10 %s removes the card from Continue alone, leaving its copy on New",
    async (label, request) => {
      await visit();

      await rightClick(card("c1", "Continue"));
      await choose(label);

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith("c1");
      expect(shelfCards("Continue")).toEqual([title("c2")]);
      expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);
      expect(deleteFile).not.toHaveBeenCalled();
    },
  );

  it("SPEC-CORE-157 I6 a failed Remove from Continue keeps the card and shows the error toast", async () => {
    dismissContinueItem.mockRejectedValueOnce(new Error("boom"));
    await visit();

    await rightClick(card("c1", "Continue"));
    await choose("Remove from Continue");

    expect(dismissContinueItem).toHaveBeenCalledWith("c1");
    expect(shelfCards("Continue")).toEqual([title("c1"), title("c2")]);
    expect(toast("alert", "Could not remove from Continue")).not.toBeNull();
  });

  it("SPEC-CORE-157 I6 a failed Remove from history keeps the card, closes the menu and shows no toast", async () => {
    deleteWatchProgress.mockRejectedValueOnce(new Error("boom"));
    await visit();

    await rightClick(card("c1", "Continue"));
    await choose("Remove from history");

    expect(deleteWatchProgress).toHaveBeenCalledWith("c1");
    expect(shelfCards("Continue")).toEqual([title("c1"), title("c2")]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("SPEC-CORE-157 a second Remove from Continue while the first is in flight sends a second request, and the card leaves once", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    dismissContinueItem.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    server.continue = ["c1", "c2", "n1"];
    await visit();

    await rightClick(card("c1", "Continue"));
    await choose("Remove from Continue");
    await rightClick(card("c1", "Continue"));
    await choose("Remove from Continue");
    expect(dismissContinueItem).toHaveBeenCalledTimes(2);

    await act(async () => first.resolve());
    await act(async () => second.resolve());
    await flush();

    expect(shelfCards("Continue")).toEqual([title("c2"), title("n1")]);
  });
});

describe("SPEC-CORE-157 I6 a dialog whose card leaves meanwhile", () => {
  it("SPEC-CORE-157 I6 the rename dialog stays open and renames its file after the card left Continue", async () => {
    const dismissal = deferred<void>();
    dismissContinueItem.mockReset().mockReturnValue(dismissal.promise);
    await visit();

    await rightClick(card("c1", "Continue"));
    await choose("Remove from Continue");
    await rightClick(card("c1", "Continue"));
    await choose("Rename");
    await act(async () => dismissal.resolve());
    await flush();
    expect(shelfCards("Continue")).toEqual([title("c2")]);

    await submit("submit-rename");

    expect(renameFile).toHaveBeenCalledWith("c1", "renamed.mp4");
  });
});

describe("SPEC-CORE-157 I5 the re-read after rename or move", () => {
  it.each([
    ["Rename", "submit-rename"],
    ["Move", "submit-move"],
  ] as const)(
    "SPEC-CORE-157 I5 after %s the page asks by=all for the one id with no Target filter, and every card for it redraws in place",
    async (row, button) => {
      renameFile.mockImplementation(async (id: string) => asItem(id));
      await visit();
      const before = reReads().length;

      await rightClick(card("c1", "New"));
      await choose(row);
      server.names.c1 = "Vid fresh";
      await submit(button);

      const asked = reReads().slice(before);
      expect(asked).toHaveLength(1);
      expect(asked[0]).toEqual({ by: "all", ids: ["c1"] });
      expect(shelfCards("Continue")).toEqual(["Vid fresh", title("c2")]);
      expect(shelfCards("New")).toEqual(["Vid fresh", title("n1"), title("n2")]);
    },
  );

  it("SPEC-CORE-157 I5 under a saved smart-folder Target the re-read still carries no Target filter", async () => {
    getSmartFolders.mockResolvedValue([
      { id: "sf", drive, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
    ]);
    writeAppPrefs(drive, { target: "sf" });
    renameFile.mockImplementation(async (id: string) => asItem(id));
    await visit();
    const before = reReads().length;

    await rename(card("n1", "New"));

    expect(reReads().slice(before)).toEqual([{ by: "all", ids: ["n1"] }]);
  });

  it("SPEC-CORE-157 I5 of two overlapping re-reads only the latest answer is drawn", async () => {
    renameFile.mockImplementation(async (id: string) => asItem(id));
    await visit();
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    const answers = [older, newer];
    getShelves.mockImplementation(async (d, p: Params) =>
      p.by === "all" && Array.isArray(p.ids) && (p.ids as string[]).length === 1 && answers.length > 0
        ? answers.shift()!.promise
        : answerShelves(d, p),
    );
    const reply = (name: string) => ({
      by: "all", total_shelves: 1, base: "",
      shelves: [{ key: "all", label: "", count: 1, items: [{ ...asItem("n1"), title: name }] }],
    });

    await rename(card("n1", "New"));
    await rename(card("n1", "New"));
    await act(async () => newer.resolve(reply("Vid newer")));
    await flush();
    await act(async () => older.resolve(reply("Vid older")));
    await flush();

    expect(shelfCards("New")).toEqual([title("c1"), "Vid newer", title("n2")]);
  });

  it.each([
    ["fails", () => Promise.reject(new Error("boom"))],
    ["answers no item", () => Promise.resolve({ by: "all", total_shelves: 0, base: "", shelves: [] })],
  ] as const)("SPEC-CORE-157 I5 a re-read that %s keeps what the cards drew, with no toast", async (_name, outcome) => {
    await visit();
    getShelves.mockImplementation(async (d, p: Params) =>
      p.by === "all" && Array.isArray(p.ids) && (p.ids as string[]).length === 1 ? outcome() : answerShelves(d, p),
    );
    const before = reReads().length;

    await rename(card("n1", "New"));

    expect(reReads().length).toBe(before + 1);
    expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("SPEC-CORE-157 I5 I6 a failed rename sends no re-read and keeps its dialog open", async () => {
    renameFile.mockRejectedValueOnce(new Error("boom"));
    await visit();
    const before = reReads().length;

    await rename(card("n1", "New"));

    expect(renameFile).toHaveBeenCalledWith("n1", "renamed.mp4");
    expect(reReads().length).toBe(before);
    expect(screen.getByText("submit-rename")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-157 I9 a change of drive or profile while an action is in flight", () => {
  it("SPEC-CORE-157 I9 a trash answered after the drive changed does not touch the new drive's lists", async () => {
    const pending = deferred<void>();
    deleteFile.mockReset().mockReturnValue(pending.promise);
    const view = await visit();
    await trash(card("n1", "New"));
    expect(deleteFile).toHaveBeenCalledWith("n1");

    drive = freshDrive();
    catalogue.catalogueDrive = drive;
    view.rerender(app(drive));
    await flush();
    expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);

    await act(async () => pending.resolve());
    await flush();

    expect(shelfCards("New")).toEqual([title("c1"), title("n1"), title("n2")]);
  });

  it("SPEC-CORE-157 I9 a Remove from Continue answered after the profile changed does not touch the new profile's Continue", async () => {
    const pending = deferred<void>();
    dismissContinueItem.mockReset().mockReturnValue(pending.promise);
    const view = await visit();
    await rightClick(card("c1", "Continue"));
    await choose("Remove from Continue");
    expect(dismissContinueItem).toHaveBeenCalledWith("c1");

    nickname = "bob";
    view.rerender(app());
    await flush();
    expect(shelfCards("Continue")).toEqual([title("c1"), title("c2")]);

    await act(async () => pending.resolve());
    await flush();

    expect(shelfCards("Continue")).toEqual([title("c1"), title("c2")]);
  });
});

describe("SPEC-CORE-157 I7 the provider-answer removal set", () => {
  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I7 SPEC-CORE-076 I7 as revised an id trashed through the menu is left out of the next visit's stored Recommended",
    async () => {
      server.all = ["r1", "r2", "r3"];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      const first = await visit();
      await trash(card("r2", "Recommended"));
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);
      first.unmount();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["r1", "r3"]]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I7 a provider answer stored after the trash, also after unmount, is stored without the id",
    async () => {
      server.all = ["r1", "r2", "r3"];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      (await visit()).unmount();

      const answer = deferred<void>();
      intel.pickup = vi.fn<Provider>(async ({ restrict }) => {
        await answer.promise;
        return restrict(["r1", "r2", "r3"]);
      });
      const second = await visit();
      await trash(card("r2", "Recommended"));
      second.unmount();
      await act(async () => answer.resolve());
      await flush();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["r1", "r3"]]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I7 Remove from Continue and Remove from history leave the stored Recommended ids as they were",
    async () => {
      server.continue = ["c1", "c2"];
      server.all = ["c1", "c2", "r1"];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["c1", "c2", "r1"]);
      const first = await visit();
      await rightClick(card("c1", "Continue"));
      await choose("Remove from Continue");
      await rightClick(card("c2", "Continue"));
      await choose("Remove from history");
      expect(shelfCards("Continue")).toEqual([]);
      expect(shelfCards("Recommended")).toEqual([title("c1"), title("c2"), title("r1")]);
      first.unmount();

      const from = restrictCalls().length;
      intel.pickup = silent();
      await visit();

      expect(idsSince(from)).toEqual([["c1", "c2", "r1"]]);
    },
  );

  it.runIf(intelligenceLinked)(
    "SPEC-CORE-157 I7 a Recommended Undo does not draw again a file trashed through the menu after the action",
    async () => {
      const undo = vi.fn(async () => {});
      intelActions.pickup = () => [{ id: "x", label: ACTION, run: async () => ({ message: "Removed", undo }) }];
      server.all = ["r1", "r2", "r3"];
      declare({ recommended: [PICKUP] });
      intel.pickup = restricting(["r1", "r2", "r3"]);
      await visit();

      await rightClick(card("r2", "Recommended"));
      await choose(ACTION);
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);
      await trash(card("r2", "New"));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: UNDO }));
      });
      await flush();

      expect(undo).toHaveBeenCalledTimes(1);
      expect(shelfCards("Recommended")).toEqual([title("r1"), title("r3")]);
      expect(screen.queryByText(title("r2"))).toBeNull();
    },
  );
});

describe("SPEC-CORE-157 I3 I4 the ungrouped Library grid", () => {
  async function openUngrouped() {
    writeAppPrefs(drive, { face: "library" });
    await visit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Group By/ }));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: "None" }));
    });
    await flush();
  }

  const drawnIds = () =>
    screen.queryAllByText(/^Vid a\d+$/).map((el) => (el.textContent ?? "").replace("Vid ", ""));

  async function nextPage() {
    const live = FakeObserver.instances.filter((o) => o.live);
    await act(async () => {
      live.at(-1)!.trigger();
    });
    await flush();
  }

  it("SPEC-CORE-157 I3 a card trashed from the grid leaves it and its neighbours close up", async () => {
    server.continue = [];
    server.all = ["a0", "a1", "a2"];
    await openUngrouped();
    expect(drawnIds()).toEqual(["a0", "a1", "a2"]);

    await trash(card("a1"));

    expect(drawnIds()).toEqual(["a0", "a2"]);
  });

  it("SPEC-CORE-157 I3 the grid shows its empty state when its last card is trashed", async () => {
    server.continue = [];
    server.all = ["a0"];
    await openUngrouped();
    expect(screen.queryByText("No files")).toBeNull();

    await trash(card("a0"));

    expect(drawnIds()).toEqual([]);
    expect(screen.getByText("No files")).toBeInTheDocument();
  });

  it("SPEC-CORE-157 I3 a trash from a grouped Library shelf drops the shelf's count by one", async () => {
    server.continue = [];
    server.all = ["a0", "a1", "a2"];
    writeAppPrefs(drive, { face: "library" });
    await visit();
    expect(within(shelf("Movies")).getByText("3")).toBeInTheDocument();

    await trash(card("a1", "Movies"));

    expect(within(shelf("Movies")).queryByText("Vid a1")).toBeNull();
    expect(within(shelf("Movies")).getByText("2")).toBeInTheDocument();
    expect(within(shelf("Movies")).queryByText("3")).toBeNull();
  });

  it("SPEC-CORE-157 I4 the page loaded after a trash neither skips nor repeats a file compared with a fresh load", async () => {
    server.continue = [];
    server.all = Array.from({ length: 130 }, (_, i) => `a${i}`);
    await openUngrouped();
    const firstPage = drawnIds();
    expect(firstPage.length).toBeGreaterThan(1);
    expect(firstPage.length).toBeLessThan(130);

    await trash(card("a3"));
    await nextPage();

    const drawn = drawnIds();
    const fresh = server.all.slice(0, drawn.length);
    expect(drawn).toEqual(fresh);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeGreaterThan(firstPage.length);
  });
});
