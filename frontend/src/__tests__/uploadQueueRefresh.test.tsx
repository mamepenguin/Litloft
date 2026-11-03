/**
 * SPEC-CORE-030 I8/I12 — a completed upload refreshes the listing views of
 * its own drive, and nothing else re-fetches: not another drive's view, not
 * the search results, and not **Clear**.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@/lib/api", async () => (await import("@/__tests__/helpers/uploadApiMock")).apiMock());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ name: "main" }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false, getSlotEntries: () => [], hasSlot: () => false }),
}));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => ({ nickname: null, loading: false }) }));
vi.mock("@/components/SidebarProvider", () => ({ useSidebar: () => ({ isOpen: false, isOverlay: false, close: vi.fn() }) }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div /> }));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));

import { mockedApi, type UploadApi } from "@/__tests__/helpers/uploadApiMock";
import { dropOn, flush, initResult } from "@/__tests__/helpers/uploadQueue";

type FolderBrowserType = typeof import("@/components/FolderBrowser").FolderBrowser;
type UploadProgressType = typeof import("@/components/UploadProgress").UploadProgress;

interface Modules {
  FolderBrowser: FolderBrowserType;
  UploadProgress: UploadProgressType;
}

async function loadModules(): Promise<Modules> {
  const [{ FolderBrowser }, { UploadProgress }] = await Promise.all([
    import("@/components/FolderBrowser"),
    import("@/components/UploadProgress"),
  ]);
  return { FolderBrowser, UploadProgress };
}

type ListingCall = [string, Record<string, unknown>];

const listingCalls = (api: UploadApi): ListingCall[] =>
  api.getDriveFiles.mock.calls as ListingCall[];

const listingsFor = (
  api: UploadApi,
  drive: string,
  matches: (params: Record<string, unknown>) => boolean,
): number =>
  listingCalls(api).filter(([calledDrive, params]) => calledDrive === drive && matches(params))
    .length;

const FOLDER_RECIPES = (p: Record<string, unknown>) => p.path === "recipes";
const FOLDER_SERIES = (p: Record<string, unknown>) => p.path === "series";
const DRIVE_ROOT = (p: Record<string, unknown>) => !p.path;
const SEARCH = (p: Record<string, unknown>) => p.search === "lentil";

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-030 I8 — a completion refreshes its own drive's views", () => {
  it("SPEC-CORE-030 I8 refreshes the same drive's listings and no other view", async () => {
    const api = await mockedApi();
    const { FolderBrowser } = await loadModules();

    const view = render(
      <>
        <FolderBrowser driveName="main" folderPath="recipes" />
        <FolderBrowser driveName="main" folderPath="series" />
        <FolderBrowser driveName="other" />
        <FolderBrowser driveName="main" searchQuery="lentil" />
      </>,
    );
    await flush(20);

    const before = {
      recipes: listingsFor(api, "main", FOLDER_RECIPES),
      series: listingsFor(api, "main", FOLDER_SERIES),
      other: listingsFor(api, "other", DRIVE_ROOT),
      search: listingsFor(api, "main", SEARCH),
    };
    expect(before.recipes).toBeGreaterThan(0);
    expect(before.series).toBeGreaterThan(0);
    expect(before.search).toBeGreaterThan(0);

    const zones = view.container.querySelectorAll("[data-upload-zone]");
    expect(zones).toHaveLength(3);

    api.initUpload.mockResolvedValue(initResult("upload-1"));
    api.uploadChunk.mockResolvedValue({});
    api.completeUpload.mockResolvedValue({});

    await dropOn(view.container, [new File(["x"], "a.txt")], 0);
    await flush(20);

    expect(api.completeUpload).toHaveBeenCalledTimes(1);
    expect(listingsFor(api, "main", FOLDER_RECIPES)).toBeGreaterThan(before.recipes);
    expect(listingsFor(api, "main", FOLDER_SERIES)).toBeGreaterThan(before.series);
    expect(listingsFor(api, "other", DRIVE_ROOT)).toBe(before.other);
    expect(listingsFor(api, "main", SEARCH)).toBe(before.search);
  });
});

describe("SPEC-CORE-030 I12 — Clear refreshes nothing", () => {
  it("SPEC-CORE-030 I12 removes the finished entries without re-fetching a listing", async () => {
    const api = await mockedApi();
    const { FolderBrowser, UploadProgress } = await loadModules();
    const Drawer = UploadProgress as unknown as ComponentType;
    api.initUpload.mockResolvedValue(initResult("upload-1"));

    const view = render(
      <>
        <FolderBrowser driveName="main" folderPath="recipes" />
        <FolderBrowser driveName="other" />
        <Drawer />
      </>,
    );
    await flush(20);

    await dropOn(view.container, [new File(["x"], "a.txt")], 0);
    await flush(20);
    expect(screen.getByText("a.txt")).toBeInTheDocument();

    const before = {
      recipes: listingsFor(api, "main", FOLDER_RECIPES),
      other: listingsFor(api, "other", DRIVE_ROOT),
    };

    await act(async () => {
      fireEvent.click(screen.getByText("Clear"));
    });
    await flush(20);

    expect(screen.queryByText("a.txt")).toBeNull();
    expect(listingsFor(api, "main", FOLDER_RECIPES)).toBe(before.recipes);
    expect(listingsFor(api, "other", DRIVE_ROOT)).toBe(before.other);
  });
});
