/**
 * SPEC-CORE-145 I8: while the inputs the view depends on are still loading,
 * the Library sends no request whose view would then be replaced.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ProfileProvider } from "@/components/ProfileProvider";
import { writeAppPrefs, writeTargetView } from "@/lib/appPrefs";
import { VideoApp } from "../VideoApp";

const DRIVE = "main";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: DRIVE,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();
const getCollections = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getShelvesWithFileIds: (drive: string, params: unknown) => getShelves(drive, params),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getDriveFilesWithFileIds: (drive: string, params: unknown) => getDriveFiles(drive, params),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
  getCollections: (...args: unknown[]) => getCollections(...args),
}));

const evaluateSmartCollection = vi.fn();
vi.mock("@/lib/smartCollectionEval", () => ({
  evaluateSmartCollection: (...args: unknown[]) => evaluateSmartCollection(...args),
}));

type Params = Record<string, unknown>;

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
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

function smartFolder(id: string, name: string, query: string) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function shelves(_drive: string, params: Params) {
  const by = String(params.by);
  const key = by === "watch" ? "unwatched" : "one";
  const title = by === "watch" ? "Unwatched" : `${by} shelf`;
  return {
    by,
    total_shelves: 1,
    shelves: [{ key, label: title, count: 1, items: [item(`i-${by}`, `${by} card`)] }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function libraryCalls(): Params[] {
  return getShelves.mock.calls
    .map(([, params]) => params as Params)
    .filter((params) => params.per_shelf === 5 || (params.by === "all" && params.per_shelf === 60));
}

const TRIPS = smartFolder("sf-trips", "Trips", "tag:Trip");
const CATS = smartFolder("sf-cats", "Cats", "cats");

beforeEach(() => {
  localStorage.clear();
  document.cookie = "lit_viewer=alice; path=/";
  getShelves.mockReset().mockImplementation(async (drive, params) => shelves(drive, params));
  getDriveFiles.mockReset().mockResolvedValue({
    data: [],
    meta: { total: 1, page: 1, limit: 12 },
  });
  getSmartFolders.mockReset().mockResolvedValue([]);
  getCollections.mockReset().mockResolvedValue([]);
  evaluateSmartCollection.mockReset();
});

afterEach(() => {
  document.cookie = "lit_viewer=; path=/; max-age=0";
});

describe("SPEC-CORE-145 I8 the view waits for its input", () => {
  it("SPEC-CORE-145 I8 sends no Library request while the Target list is loading", async () => {
    const folders = deferred<unknown[]>();
    getSmartFolders.mockReturnValue(folders.promise);
    writeAppPrefs(DRIVE, { face: "library", target: "sf-trips" });
    writeTargetView("video", DRIVE, "sf-trips", { group: "tag", sort: "size" });

    render(
      <ProfileProvider>
        <VideoApp drive={DRIVE} />
      </ProfileProvider>,
    );

    await waitFor(() => expect(getSmartFolders).toHaveBeenCalled());
    expect(libraryCalls()).toEqual([]);

    folders.resolve([TRIPS]);
    expect(await screen.findByRole("heading", { level: 2, name: "tag shelf" })).toBeInTheDocument();
    expect(libraryCalls().length).toBeGreaterThan(0);
    for (const call of libraryCalls()) {
      expect(call).toMatchObject({ by: "tag", sort: "file_size" });
    }
  });

  it("SPEC-CORE-145 I8 sends no Library request while a member Target is evaluated", async () => {
    const members = deferred<unknown>();
    evaluateSmartCollection.mockReturnValue(members.promise);
    getSmartFolders.mockResolvedValue([CATS]);
    writeAppPrefs(DRIVE, { face: "library", target: "sf-cats" });
    writeTargetView("video", DRIVE, "sf-cats", { group: "month", sort: "size" });

    render(
      <ProfileProvider>
        <VideoApp drive={DRIVE} />
      </ProfileProvider>,
    );

    await waitFor(() => expect(evaluateSmartCollection).toHaveBeenCalled());
    expect(libraryCalls()).toEqual([]);

    members.resolve({ complete: true, files: [{ id: "m1" }] });
    expect(await screen.findByRole("heading", { level: 2, name: "month shelf" })).toBeInTheDocument();
    expect(libraryCalls().length).toBeGreaterThan(0);
    for (const call of libraryCalls()) {
      expect(call).toMatchObject({ by: "month", sort: "file_size" });
    }
  });

  it("SPEC-CORE-147 I7 a stored Watch State shows Folder and never sends by=watch from the Library", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    writeTargetView("video", DRIVE, "default", { group: "watch" });

    render(
      <ProfileProvider>
        <VideoApp drive={DRIVE} />
      </ProfileProvider>,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "folder shelf" })).toBeInTheDocument();
    expect(libraryCalls().length).toBeGreaterThan(0);
    for (const call of libraryCalls()) {
      expect(call.by).toBe("folder");
    }
  });
});
