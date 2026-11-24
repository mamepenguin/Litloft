/**
 * SPEC-CORE-084: on a two-pane file page, when the left pane is what stops
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
  class ResizeObserverMock {
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  treeEnabledStore.reset();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

function page(fileId: string | null, mount = 0) {
  mockSearchParams = new URLSearchParams(fileId ? `file=${fileId}` : "");
  return (
    <>
      <div data-testid="toolbar">
        <TreeToggle drive="work" />
      </div>
      <TwoPaneLayout key={mount} drive="work" folderPath="">
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


describe("SPEC-CORE-084 a remount while the pane is yielded", () => {
  it("SPEC-CORE-084 I8 keeps the tree button on the yield path after the layout remounts", async () => {
    const utils = await openFile(VIDEO.id);
    expect(paneCollapsed()).toBe(true);
    expect(treeWrites()).toEqual([]);

    utils.rerender(page(VIDEO.id, 1));
    await fileShown(VIDEO.id);
    await act(async () => {});
    expect(paneCollapsed()).toBe(true);
    expect(localStorage.getItem("tree:enabled:work")).toBe("true");

    fireEvent.click(treeButton());

    await waitFor(() => expect(paneCollapsed()).toBe(false));
    expect(treeWrites()).toEqual([]);
    expect(localStorage.getItem("tree:enabled:work")).toBe("true");
  });
});
