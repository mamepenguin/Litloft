/**
 * The file menu only opens on a single file, and a page change after an action
 * belongs to the lists still held for the same drive, Target and profile.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { writeAppPrefs, writeTargetView } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";
import {
  deferred,
  flush,
  freshDrive,
  item,
  title,
  useFakeClock,
  type Entry,
  type Params,
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
  moveFile: vi.fn(),
  dismissContinueItem: (...args: unknown[]) => dismissContinueItem(...args),
  deleteWatchProgress: (...args: unknown[]) => deleteWatchProgress(...args),
}));

const server = { continue: [] as string[], all: [] as string[] };
let drive = "";

const asItem = (id: string) => item(id, title(id), drive);
const continueItem = (id: string) => ({
  ...asItem(id),
  watch_progress: { position: 30, duration: 120 },
});

function answerShelves(_d: string, p: Params) {
  if (p.ids !== undefined) {
    const live = new Set([...server.all, ...server.continue]);
    const items = (p.ids as string[]).filter((id) => live.has(id)).map(asItem);
    return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
  }
  if (p.by === "watch" && p.key === "continue") {
    const items = server.continue.map(continueItem);
    return { by: "watch", total_shelves: 1, base: "", shelves: [{ key: "continue", label: "", count: items.length, items }] };
  }
  if (p.by === "folder") {
    const items = server.all.slice(0, Number(p.per_shelf ?? 5)).map(asItem);
    return { by: "folder", total_shelves: 1, base: "", shelves: [{ key: "Movies", label: "Movies", count: server.all.length, items }] };
  }
  const items = server.all.map(asItem);
  return { by: p.by, total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

function answerFiles() {
  const items = server.all.map(asItem);
  return { data: items, meta: { total: items.length, page: 1, limit: 12 } };
}

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

function app() {
  return (
    <ToastProvider>
      <VideoApp drive={drive} />
    </ToastProvider>
  );
}

async function visit() {
  const view = render(app());
  await flush();
  return view;
}

function card(id: string, heading?: string): HTMLElement {
  const root =
    heading === undefined
      ? screen
      : within(
          [...document.querySelectorAll("section")].find(
            (section) =>
              section.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
          ) as HTMLElement,
        );
  const text = root.getByText(title(id));
  return (text.closest("a") as HTMLElement | null) ?? text;
}

async function rightClick(target: HTMLElement): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.contextMenu(target);
  });
  await flush();
  return notPrevented;
}

async function choose(label: string) {
  const row = screen.getByRole("menuitem", { name: label });
  await act(async () => {
    fireEvent.click(row);
  });
  await flush();
}

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

async function openFace(name: "Library" | "Discover") {
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
  await flush();
}

async function chooseTarget() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Target: All videos/ }));
  });
  await flush();
  const row = await screen.findByRole("menuitemradio", { name: "Trips" });
  await act(async () => {
    fireEvent.click(row);
  });
  await flush();
  await screen.findByRole("button", { name: "Target: Trips" });
}

/** The file menu in particular; a view menu is a menu too. */
function menuCount() {
  return screen.queryAllByRole("menuitem", { name: "Open in new tab" }).length;
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
  getShelves.mockReset().mockImplementation(async (d, p) => answerShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async () => answerFiles());
  getSmartFolders.mockReset().mockResolvedValue([
    { id: "sf", drive, name: "Trips", query: "tag:Trip", file_type: null, sort_by: null, sort_order: null, created_at: "", updated_at: null },
  ]);
  getCollections.mockReset().mockResolvedValue([]);
  deleteFile.mockReset().mockImplementation(async (id: string) => {
    server.all = server.all.filter((held) => held !== id);
    server.continue = server.continue.filter((held) => held !== id);
  });
  renameFile.mockReset().mockImplementation(async (id: string) => asItem(id));
  dismissContinueItem.mockReset().mockResolvedValue(undefined);
  deleteWatchProgress.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("I1 only a single file opens the file menu", () => {
  it("a shelf heading, its See all link, the tabs and a skeleton leave the browser's menu alone", async () => {
    let releaseContinue: (() => void) | null = null;
    getShelves.mockImplementation(async (d, p) => {
      if (p.by === "watch") {
        await new Promise<void>((resolve) => {
          releaseContinue = resolve;
        });
      }
      return answerShelves(d, p);
    });
    const view = await visit();
    const skeleton = document.querySelector(".animate-pulse") as HTMLElement;
    expect(skeleton).not.toBeNull();

    expect(await rightClick(skeleton)).toBe(true);
    expect(menuCount()).toBe(0);

    await act(async () => releaseContinue?.());
    await flush();

    const heading = within(
      [...document.querySelectorAll("section")].find(
        (section) => section.querySelector("h2")?.textContent?.trim() === "New",
      ) as HTMLElement,
    ).getByText("New");
    expect(await rightClick(heading)).toBe(true);
    expect(menuCount()).toBe(0);

    const newSection = [...document.querySelectorAll("section")].find(
      (section) => section.querySelector("h2")?.textContent?.trim() === "New",
    ) as HTMLElement;
    expect(await rightClick(within(newSection).getByRole("link", { name: /See all/ }))).toBe(true);
    expect(await rightClick(screen.getByRole("tab", { name: "Library" }))).toBe(true);
    expect(menuCount()).toBe(0);
    view.unmount();
  });

  it("the Library's view and filter menus and its name field leave the browser's menu alone", async () => {
    writeAppPrefs(drive, { face: "library", target: "default" });
    await visit();
    await screen.findByText(title("n1"));

    expect(await rightClick(screen.getByRole("button", { name: /Group By/ }))).toBe(true);
    expect(menuCount()).toBe(0);
    expect(await rightClick(screen.getByRole("button", { name: /Sort By/ }))).toBe(true);
    expect(menuCount()).toBe(0);
    const nameIcon = screen.getByRole("button", { name: "Filter by name" });
    expect(await rightClick(nameIcon)).toBe(true);
    expect(menuCount()).toBe(0);
    await act(async () => {
      fireEvent.click(nameIcon);
    });
    expect(await rightClick(await screen.findByRole("searchbox", { name: "Filter by name" }))).toBe(true);
    expect(menuCount()).toBe(0);
    expect(await rightClick(screen.getByRole("button", { name: /Tag/ }))).toBe(true);
    expect(menuCount()).toBe(0);
    expect(menuCount()).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tag/ }));
    });
    const anyTag = await screen.findByRole("menuitemcheckbox", { name: /^Any/ });
    expect(await rightClick(anyTag)).toBe(true);
    expect(menuCount()).toBe(0);
  });

  it("the Discover tab, opened and closed, never puts a file menu on a non-file element", async () => {
    await visit();
    await openFace("Library");
    await openFace("Discover");
    expect(await rightClick(screen.getByRole("tab", { name: "Discover" }))).toBe(true);
    expect(menuCount()).toBe(0);
  });
});

describe("I9 a Target change while an action or re-read is in flight", () => {
  it("a trash answered after the Target changed does not touch the new Target's lists", async () => {
    const pending = deferred<void>();
    deleteFile.mockReset().mockReturnValue(pending.promise);
    await visit();
    await rightClick(card("n1", "New"));
    await choose("Move to Trash");
    await submit("submit-trash");

    await chooseTarget();
    expect(await screen.findByText(title("n1"))).toBeInTheDocument();

    await act(async () => pending.resolve());
    await flush();

    expect(screen.getByText(title("n1"))).toBeInTheDocument();
    expect(screen.getByText(title("n2"))).toBeInTheDocument();
  });

  it("a re-read answered after the Target changed does not redraw the new Target's cards", async () => {

    const answer = deferred<unknown>();
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.by === "all" && Array.isArray(p.ids) && p.ids.length === 1) return answer.promise;
      return answerShelves(d, p);
    });
    await visit();
    await rightClick(card("n1", "New"));
    await choose("Rename");
    await submit("submit-rename");

    await chooseTarget();
    expect(await screen.findByText(title("n1"))).toBeInTheDocument();

    await act(async () =>
      answer.resolve({
        by: "all",
        total_shelves: 1,
        base: "",
        shelves: [{ key: "all", label: "", count: 1, items: [{ ...asItem("n1"), title: "Vid fresh" }] }],
      }),
    );
    await flush();

    expect(screen.getByText(title("n1"))).toBeInTheDocument();
    expect(screen.queryByText("Vid fresh")).toBeNull();
  });
});

describe("I4 a later page never draws an id the list already holds", () => {
  const PAGE = 60;
  const drawn = () =>
    screen.queryAllByText(/^Vid p\d+$/).map((el) => (el.textContent ?? "").replace("Vid ", ""));

  async function nextPage() {
    await act(async () => {
      FakeObserver.instances.filter((observer) => observer.live).at(-1)!.trigger();
    });
    await flush();
  }

  it("after a rename under a name sort, the Library grid's next page drops the shifted repeat", async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `p${i}`);
    server.continue = [];
    server.all = ids;
    writeAppPrefs(drive, { face: "library", target: "default" });
    writeTargetView("video", drive, "default", { group: "all", sort: "title" });
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.ids !== undefined) return answerShelves(d, p);
      if (p.by === "all") {
        const page = Number(p.page ?? 1);
        const start = (page - 1) * PAGE;
        const items = server.all.slice(start, start + PAGE).map(asItem);
        if (page === 2) items.unshift(asItem(server.all[PAGE - 1]));
        return {
          by: "all",
          total_shelves: 1,
          base: "",
          shelves: [{ key: "all", label: "", count: server.all.length, items }],
        };
      }
      return answerShelves(d, p);
    });
    await visit();
    await screen.findByText(title("p0"));

    await rightClick(card("p0"));
    await choose("Rename");
    await submit("submit-rename");
    const first = drawn();
    await nextPage();

    const shown = drawn();
    expect(shown.length).toBeGreaterThan(first.length);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("a grouped Library's next page drops a shelf key it already holds", async () => {
    const keys = Array.from({ length: 13 }, (_, i) => `s${i}`);
    server.continue = [];
    server.all = [];
    writeAppPrefs(drive, { face: "library", target: "default" });
    writeTargetView("video", drive, "default", { group: "folder", sort: "title" });
    getShelves.mockImplementation(async (_d, p: Params) => {
      if (p.by === "folder") {
        const start = Number(p.offset ?? 0);
        const page = keys.slice(start, start + 12).map((key) => ({
          key,
          label: `Shelf ${key}`,
          count: 1,
          items: [asItem(key)],
        }));
        if (start === 12) page.unshift({ key: keys[11], label: "Shelf s11", count: 1, items: [asItem("s11")] });
        return { by: "folder", total_shelves: keys.length, base: "", shelves: page };
      }
      return answerShelves(_d, p);
    });
    await visit();
    await screen.findByText("Shelf s0");

    await nextPage();

    const headings = [...document.querySelectorAll("section h2")].map((h) => h.textContent?.trim());
    expect(headings).toContain("Shelf s12");
    expect(new Set(headings).size).toBe(headings.length);
  });
});
