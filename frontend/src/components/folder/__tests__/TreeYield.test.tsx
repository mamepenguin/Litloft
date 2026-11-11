/**
 * SPEC-CORE-083: on a two-pane file page, when the left pane is what stops
 * a player file's inspector fitting beside the player, the pane is collapsed
 * for the file page without touching the stored tree setting, and the tree
 * button brings it back for good.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/work",
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}));

const files = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/api", () => {
  const getFile = (id: string) => Promise.resolve(files.get(id));
  return {
    getFile,
    getFileShared: getFile,
    recordFileView: () => Promise.resolve(undefined),
    likeFile: () => Promise.resolve(undefined),
    dislikeFile: () => Promise.resolve(undefined),
    updateFile: () => Promise.resolve({}),
    getFolderTree: () => Promise.resolve([]),
    getFolders: () => Promise.resolve([]),
    getDriveFiles: () =>
      Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 30 } }),
    getStreamUrl: (id: string) => `/api/files/${id}/stream`,
    getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
    getPins: () => Promise.resolve([]),
    addPin: () => Promise.resolve(undefined),
    removePin: () => Promise.resolve(undefined),
    createTextFile: () => Promise.resolve({}),
    createFolder: () => Promise.resolve({}),
    renameFolder: () => Promise.resolve({}),
    moveFolder: () => Promise.resolve({}),
    deleteFolder: () => Promise.resolve(undefined),
    renameFile: () => Promise.resolve({}),
    moveFile: () => Promise.resolve({}),
    deleteFile: () => Promise.resolve(undefined),
    getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  };
});

const overlayRequests = vi.hoisted(() => [] as boolean[]);
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({
    requestRefresh: vi.fn(),
    isOpen: false,
    isOverlay: true,
    toggle: vi.fn(),
    close: vi.fn(),
    setOverlayMode: vi.fn(),
    refreshKey: 0,
  }),
  useOverlaySidebarWhen: (active: boolean) => {
    overlayRequests.push(active);
  },
  useOverlaySidebar: vi.fn(),
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
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));
vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: () => <div data-testid="image-gallery" />,
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: () => undefined,
  }),
}));

vi.mock("@/components/FilePreview", async () => ({
  FilePreview: (await import("../../FileDetail/__tests__/harness")).FilePreviewStub,
}));
vi.mock("@/components/ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("../../FileDetail/__tests__/harness"))
    .ActiveSummaryHostStub,
}));
vi.mock("@/components/FileDetail/related/RelatedPanel", async () => ({
  RelatedPanel: (await import("../../FileDetail/__tests__/harness")).RelatedPanelStub,
}));
vi.mock("@/components/FileDetail/related/useFileRelations", async () => ({
  useFileRelations: (await import("../../FileDetail/__tests__/harness"))
    .useFileRelationsStub,
}));
vi.mock("@/components/ExifSection", async () => ({
  ExifSection: (await import("../../FileDetail/__tests__/harness")).ExifSectionStub,
}));
vi.mock("@/components/AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("../../FileDetail/__tests__/harness")).useAddonSlotsStub,
}));
vi.mock("@/components/AddonSlot", async () => {
  const harness = await import("../../FileDetail/__tests__/harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("../../FileDetail/__tests__/harness")).usePolicyMock,
}));
vi.mock("@/components/CommentSection", async () => ({
  CommentSection: (await import("../../FileDetail/__tests__/harness")).CommentSectionStub,
}));
vi.mock("@/components/EditableTagChips", async () => ({
  EditableTagChips: (await import("../../FileDetail/__tests__/harness"))
    .EditableTagChipsStub,
}));
vi.mock("@/components/FavoriteButton", async () => ({
  FavoriteButton: (await import("../../FileDetail/__tests__/harness")).FavoriteButtonStub,
}));
vi.mock("@/components/FileActions", async () => ({
  FileActions: (await import("../../FileDetail/__tests__/harness")).FileActionsStub,
}));
vi.mock("@/components/CastButton", async () => ({
  CastButton: (await import("../../FileDetail/__tests__/harness")).CastButtonStub,
}));
vi.mock("@/components/ChaptersPanel", async () => ({
  ChaptersPanel: (await import("../../FileDetail/__tests__/harness")).ChaptersPanelStub,
}));
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));

import { TwoPaneLayout } from "../TwoPaneLayout";
import { TreeToggle } from "@/components/TreeToggle";
import { makeFile, relationMocks, usePolicyMock } from "../../FileDetail/__tests__/harness";

const VIDEO = makeFile({ id: "vid000000001", drive: "work", filename: "clip.mp4", title: "Clip one" });
const VIDEO_2 = makeFile({ id: "vid000000002", drive: "work", filename: "next.mp4", title: "Clip two" });
const IMAGE = makeFile({
  id: "img000000001",
  drive: "work",
  filename: "photo.jpg",
  title: "Photo",
  file_type: "image",
  mime_type: "image/jpeg",
  duration: null,
});

/** The tree pane's width at md and wider (`md:w-[280px]`). */
const PANE_PX = 280;

let viewport = 1133;
const mediaListeners = new Set<() => void>();

function matches(query: string): boolean {
  const min = query.match(/min-width:\s*([\d.]+)(px|rem|em)/);
  const max = query.match(/max-width:\s*([\d.]+)(px|rem|em)/);
  const px = (m: RegExpMatchArray) => Number(m[1]) * (m[2] === "px" ? 1 : 16);
  if (!min && !max) return false;
  if (min && viewport < px(min)) return false;
  if (max && viewport > px(max)) return false;
  return true;
}

function setViewport(width: number) {
  viewport = width;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  inspectorOpenStore.notifyViewportChange();
  window.dispatchEvent(new Event("resize"));
  for (const l of mediaListeners) l();
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addListener: (l: () => void) => mediaListeners.add(l),
    removeListener: (l: () => void) => mediaListeners.delete(l),
    addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
    dispatchEvent: () => true,
  }),
});

/** The two-pane layout's own left pane, not an aside inside the file page. */
function leftPane(): HTMLElement {
  const pane = Array.from(document.querySelectorAll("aside")).find(
    (el) =>
      !el.closest('[data-testid="file-detail-shell"]') &&
      !el.closest('[data-testid="inspector-fit-host"]'),
  );
  if (!pane) throw new Error("no left pane");
  return pane as HTMLElement;
}

const paneCollapsed = () => leftPane().getAttribute("aria-hidden") === "true";

/** The row follows the pane: jsdom does not lay out, so this stands in for it. */
function rowWidth(): number {
  const pane = Array.from(document.querySelectorAll("aside")).find(
    (el) => !el.closest('[data-testid="file-detail-shell"]'),
  );
  const paneShown = pane !== undefined && pane.getAttribute("aria-hidden") !== "true";
  return viewport - (paneShown ? PANE_PX : 0);
}

let resizeCallbacks: Array<() => void> = [];
function fireRowResize() {
  act(() => {
    for (const cb of resizeCallbacks) cb();
  });
}

let fitValues: string[] = [];
let fitObserver: MutationObserver | null = null;

function watchForms() {
  fitValues = [];
  fitObserver = new MutationObserver((records) => {
    for (const r of records) record(r);
  });
  fitObserver.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-inspector-fit"],
    attributeOldValue: true,
  });
}

/** The loading skeleton draws a row of its own; only the file page's counts. */
function record(r: MutationRecord) {
  const target = r.target as Element;
  if (target.closest('[data-testid="file-detail-skeleton"]')) return;
  if (r.oldValue) fitValues.push(r.oldValue);
}

/** Every value the file page's `data-inspector-fit` has held, the current one included. */
function formsSeen(): string[] {
  fitObserver?.takeRecords().forEach(record);
  const now = Array.from(document.querySelectorAll('[data-testid="inspector-fit-host"]'))
    .find((el) => !el.closest('[data-testid="file-detail-skeleton"]'))
    ?.getAttribute("data-inspector-fit");
  return [...fitValues, ...(now ? [now] : [])];
}

let setItem: ReturnType<typeof vi.spyOn<Storage, "setItem">>;
const treeWrites = () =>
  setItem.mock.calls.filter(([key]) => key === "tree:enabled:work").map(([, v]) => v);

beforeEach(() => {
  files.clear();
  for (const f of [VIDEO, VIDEO_2, IMAGE]) files.set(f.id, f);
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  overlayRequests.length = 0;
  mediaListeners.clear();
  localStorage.clear();
  navigationGuard.reset();
  dirtyRegistry.reset();
  treeNarrowOpenStore.reset();
  treeEnabledStore.reset();
  treeEnabledStore.set("work", true);
  localStorage.setItem("inspector-open:work", "true");
  setViewport(1133);
  resizeCallbacks = [];
  class ResizeObserverMock {
    constructor(callback: () => void) {
      resizeCallbacks.push(() => callback());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(rowWidth);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(650);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === "ASIDE" && !this.closest('[data-testid="file-detail-shell"]')) {
      return this.getAttribute("aria-hidden") === "true" ? 0 : PANE_PX;
    }
    return 0;
  });
  setItem = vi.spyOn(Storage.prototype, "setItem");
});

afterEach(() => {
  fitObserver?.disconnect();
  fitObserver = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  treeEnabledStore.reset();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

function page(fileId: string | null) {
  mockSearchParams = new URLSearchParams(fileId ? `file=${fileId}` : "");
  return (
    <>
      <div data-testid="toolbar">
        <TreeToggle drive="work" />
      </div>
      <TwoPaneLayout drive="work" folderPath="">
        <div data-testid="listing">listing</div>
      </TwoPaneLayout>
    </>
  );
}

const titles = new Map([VIDEO, VIDEO_2, IMAGE].map((f) => [f.id, f.title as string]));

/** The file page itself, past the skeleton (which draws a row of its own). */
const fileShown = (fileId: string) =>
  waitFor(() => {
    expect(screen.queryByTestId("file-detail-skeleton")).toBeNull();
    expect(screen.getByTestId("file-preview")).toBeInTheDocument();
    expect(screen.getAllByText(titles.get(fileId)!).length).toBeGreaterThan(0);
  });

async function openFile(fileId: string) {
  const utils = render(page(fileId));
  await fileShown(fileId);
  return utils;
}

const treeButton = () =>
  within(screen.getByTestId("toolbar")).getByRole("button", { name: /(Show|Hide) tree/ });

describe("SPEC-CORE-083 the left pane yields to a player file's inspector", () => {
  it("SPEC-CORE-083 I7 collapses the pane in the file page's first frame, without writing the tree setting", async () => {
    watchForms();
    await openFile(VIDEO.id);

    // No waitFor: the pane must already be collapsed when the file page appears.
    expect(paneCollapsed()).toBe(true);
    expect(localStorage.getItem("tree:enabled:work")).toBe("true");
    expect(treeWrites()).toEqual([]);
  });

  it("SPEC-CORE-083 I7 goes straight to beside when the row fits without the pane, with no stacked or overlay frame", async () => {
    // 1133 - 280 = 853 is narrow; 1133 alone holds both.
    watchForms();
    await openFile(VIDEO.id);
    await waitFor(() => expect(paneCollapsed()).toBe(true));

    expect(formsSeen()).toEqual(["beside"]);
  });

  it("SPEC-CORE-083 I7 goes straight to stacked when the row does not fit even without the pane", async () => {
    setViewport(900);
    watchForms();
    await openFile(VIDEO.id);
    await waitFor(() => expect(paneCollapsed()).toBe(true));

    expect(formsSeen()).toEqual(["stacked"]);
  });

  it("SPEC-CORE-083 I7 keeps the sidebar in its overlay form while the pane is yielded", async () => {
    await openFile(VIDEO.id);
    await waitFor(() => expect(paneCollapsed()).toBe(true));

    expect(overlayRequests.at(-1)).toBe(true);
  });

  it("SPEC-CORE-083 I7 yields only when every condition holds", async () => {
    // The first row yields, so the table cannot pass on a pane that never
    // collapses.
    const cases: Array<{
      name: string;
      fileId: string;
      viewport: number;
      tree: boolean;
      inspector: "true" | "false";
      yields: boolean;
    }> = [
      { name: "all conditions", fileId: VIDEO.id, viewport: 1133, tree: true, inspector: "true", yields: true },
      { name: "no player", fileId: IMAGE.id, viewport: 1133, tree: true, inspector: "true", yields: false },
      { name: "inspector closed", fileId: VIDEO.id, viewport: 1133, tree: true, inspector: "false", yields: false },
      { name: "row wide with the pane", fileId: VIDEO.id, viewport: 1600, tree: true, inspector: "true", yields: false },
    ];
    for (const c of cases) {
      treeEnabledStore.set("work", c.tree);
      localStorage.setItem("inspector-open:work", c.inspector);
      setViewport(c.viewport);
      const { unmount } = await openFile(c.fileId);
      await act(async () => {});
      expect({ name: c.name, collapsed: paneCollapsed() }).toEqual({
        name: c.name,
        collapsed: c.yields,
      });
      unmount();
    }
  });

  it("SPEC-CORE-083 counts a player file's default-open inspector, with nothing stored", async () => {
    localStorage.removeItem("inspector-open:work");
    await openFile(VIDEO.id);

    expect(paneCollapsed()).toBe(true);
  });
});

describe("SPEC-CORE-083 a collection's item list is a left pane too", () => {
  it("SPEC-CORE-083 collapses the item list like the tree, without writing the setting", async () => {
    mockSearchParams = new URLSearchParams(`file=${VIDEO.id}`);
    render(
      <TwoPaneLayout
        drive="work"
        folderPath=""
        leftPane={<div data-testid="collection-items">items</div>}
        leftPaneAriaLabel="Collection items"
      >
        <div data-testid="listing">listing</div>
      </TwoPaneLayout>,
    );
    await fileShown(VIDEO.id);

    expect(paneCollapsed()).toBe(true);
    expect(treeWrites()).toEqual([]);
  });
});

describe("SPEC-CORE-083 the tree button on a file page (§3 table)", () => {
  it("SPEC-CORE-083 I8 reports a yielded pane as hidden, and pressing it shows the pane without writing storage", async () => {
    await openFile(VIDEO.id);
    expect(paneCollapsed()).toBe(true);
    expect(treeButton()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(treeButton());

    await waitFor(() => expect(paneCollapsed()).toBe(false));
    expect(treeButton()).toHaveAttribute("aria-pressed", "true");
    expect(treeWrites()).toEqual([]);
    expect(localStorage.getItem("tree:enabled:work")).toBe("true");
  });

  it("SPEC-CORE-083 I8 keeps a reopened pane shown across inspector toggles, widths and file changes", async () => {
    const utils = await openFile(VIDEO.id);
    expect(paneCollapsed()).toBe(true);
    fireEvent.click(treeButton());
    await waitFor(() => expect(paneCollapsed()).toBe(false));

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(paneCollapsed()).toBe(false);

    act(() => setViewport(1000));
    fireRowResize();
    expect(paneCollapsed()).toBe(false);

    utils.rerender(page(VIDEO_2.id));
    await fileShown(VIDEO_2.id);
    await act(async () => {});
    expect(paneCollapsed()).toBe(false);
    expect(treeWrites()).toEqual([]);
  });

  it("SPEC-CORE-083 I8 walks yielded → reopened → hidden by setting → reopened, writing only on the last two", async () => {
    await openFile(VIDEO.id);
    expect(paneCollapsed()).toBe(true);

    fireEvent.click(treeButton());
    await waitFor(() => expect(paneCollapsed()).toBe(false));
    expect(treeWrites()).toEqual([]);

    fireEvent.click(treeButton());
    await waitFor(() => expect(paneCollapsed()).toBe(true));
    expect(treeWrites()).toEqual(["false"]);
    expect(treeButton()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(treeButton());
    await waitFor(() => expect(paneCollapsed()).toBe(false));
    expect(treeWrites()).toEqual(["false", "true"]);

    // From "hidden by setting" the pane comes back as reopened, so the
    // yield conditions, which still hold, do not take it away again.
    fireRowResize();
    await act(async () => {});
    expect(paneCollapsed()).toBe(false);
  });
});

describe("SPEC-CORE-083 what does not undo a yield, and what clears it", () => {
  async function yielded() {
    const utils = await openFile(VIDEO.id);
    expect(paneCollapsed()).toBe(true);
    return utils;
  }

  it("SPEC-CORE-083 I9 stays collapsed when the inspector is closed", async () => {
    await yielded();

    fireEvent.click(screen.getByTestId("inspector-toggle"));
    await act(async () => {});

    expect(paneCollapsed()).toBe(true);
    expect(treeWrites()).toEqual([]);
  });

  it("SPEC-CORE-083 I9 stays collapsed when the window widens", async () => {
    await yielded();

    act(() => setViewport(1600));
    fireRowResize();
    await act(async () => {});

    expect(paneCollapsed()).toBe(true);
  });

  it("SPEC-CORE-083 I9 stays collapsed on moving to a file without a player", async () => {
    const utils = await yielded();

    utils.rerender(page(IMAGE.id));
    await fileShown(IMAGE.id);
    await act(async () => {});

    expect(paneCollapsed()).toBe(true);
  });

  it("SPEC-CORE-083 I9 stays collapsed across a phone crossing and back", async () => {
    await yielded();

    act(() => setViewport(700));
    await act(async () => {});
    act(() => setViewport(1133));
    fireRowResize();
    await act(async () => {});

    expect(paneCollapsed()).toBe(true);
    expect(treeWrites()).toEqual([]);
  });

  it("SPEC-CORE-083 I9 shows the pane again on the listing once the file page is left, as the setting says", async () => {
    const utils = await yielded();

    utils.rerender(page(null));
    await waitFor(() => expect(screen.getByTestId("listing")).toBeInTheDocument());

    expect(paneCollapsed()).toBe(false);
    expect(treeButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("SPEC-CORE-083 I9 clears a reopen too, so the next file page yields again", async () => {
    const utils = await yielded();
    fireEvent.click(treeButton());
    await waitFor(() => expect(paneCollapsed()).toBe(false));

    utils.rerender(page(null));
    await waitFor(() => expect(screen.getByTestId("listing")).toBeInTheDocument());
    utils.rerender(page(VIDEO.id));
    await fileShown(VIDEO.id);

    expect(paneCollapsed()).toBe(true);
  });

  it("SPEC-CORE-083 I9 clears the yield when TwoPaneLayout unmounts", async () => {
    const utils = await yielded();
    utils.unmount();

    render(page(null));
    await waitFor(() => expect(screen.getByTestId("listing")).toBeInTheDocument());

    expect(paneCollapsed()).toBe(false);
    expect(treeButton()).toHaveAttribute("aria-pressed", "true");
  });
});
