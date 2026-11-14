/**
 * SPEC-CORE-109 steps 4-7, I3, I5: the player's `smart_collection` queue mode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { FileItem } from "@/types";

const mockGetFile = vi.fn();
const mockGetCollection = vi.fn();
const mockGetSmartFolders = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getFile: (...args: unknown[]) => mockGetFile(...args),
  getFileShared: (...args: unknown[]) => mockGetFile(...args),
  getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 500 } }),
  getSmartFolders: (...args: unknown[]) => mockGetSmartFolders(...args),
  removeCollectionItem: vi.fn(),
  reorderCollectionItems: vi.fn(),
}));

const mockEvaluate = vi.fn();
vi.mock("@/lib/smartCollectionEval", () => ({
  evaluateSmartCollection: (...args: unknown[]) => mockEvaluate(...args),
}));

const mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/files/f1",
  useParams: () => ({ id: "f1" }),
}));

vi.mock("@/components/SidebarProvider", () => ({
  useOverlaySidebar: vi.fn(),
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));

const contentProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: (props: Record<string, unknown>) => {
    contentProps.push(props);
    return <div data-testid="file-detail-content">detail:{props.fileId as string}</div>;
  },
}));

const galleryProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: (props: Record<string, unknown>) => {
    galleryProps.push(props);
    return <div data-testid="image-gallery" />;
  },
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));

vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: () => ({ enabled: true, isLoading: false }),
}));

vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));

import { FileDetailFullScreen } from "../FileDetailFullScreen";

Element.prototype.scrollIntoView = vi.fn();

function file(id: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.mp4`,
    title: `Track ${id}`,
    description: "",
    drive: "main",
    folder_path: "movies",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 120,
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
    ...overrides,
  };
}

let nextId = 100;
/** Each test uses its own Smart Collection id, so a queue or failure kept in the tab's memory by one test is not seen by the next. */
function freshId(): string {
  nextId += 1;
  return String(nextId);
}

function storeQueue(id: string, name: string, ids: string[]) {
  sessionStorage.setItem(
    `smart-queue:main:${id}`,
    JSON.stringify({
      name,
      files: ids.map((fid) => ({ id: fid, title: `Track ${fid}`, file_type: "video", duration: 120 })),
    }),
  );
}

function navigations(): string[] {
  return [...mockPush.mock.calls, ...mockReplace.mock.calls].map((c) => String(c[0]));
}

function lastNavigation(): URL {
  const all = navigations();
  expect(all.length).toBeGreaterThan(0);
  return new URL(all[all.length - 1], "http://localhost");
}

function lastContent() {
  return contentProps[contentProps.length - 1];
}

async function endCurrentFile() {
  const onEnded = lastContent().onEnded as (() => void) | undefined;
  if (onEnded) act(() => onEnded());
}

const NO_EDIT_LABELS = [/move up/i, /move down/i, /remove from collection/i, /drag to reorder/i, /^reorder$/i];

function expectNoEditControls() {
  for (const label of NO_EDIT_LABELS) {
    expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByRole("button", { name: label })).toBeNull();
  }
}

/** One object per id, as the shared request returns, so a re-render does not see a new file. */
function answerFilesAs(make: (id: string) => FileItem) {
  const made = new Map<string, FileItem>();
  mockGetFile.mockImplementation(async (id: string) => {
    if (!made.has(id)) made.set(id, make(id));
    return made.get(id);
  });
}

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockGetFile.mockReset();
  answerFilesAs((id) => file(id));
  mockGetCollection.mockReset();
  mockGetSmartFolders.mockReset();
  mockEvaluate.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  contentProps.length = 0;
  galleryProps.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  for (const k of Array.from(mockSearchParams.keys())) mockSearchParams.delete(k);
});

afterEach(() => {
  cleanup();
});

describe("SPEC-CORE-109 I5 a stored queue plays as a collection does", () => {
  it("shows the queue titled with its stored name, its count, and no edit controls", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2", "f3"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f1" />);

    await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());
    expect(screen.getByText("1/3 tracks")).toBeInTheDocument();
    expect(screen.getByText("Track f2")).toBeInTheDocument();
    expect(screen.getByText("Track f3")).toBeInTheDocument();
    expectNoEditControls();
    expect(mockEvaluate).not.toHaveBeenCalled();
    expect(mockGetSmartFolders).not.toHaveBeenCalled();
    expect(mockGetCollection).not.toHaveBeenCalled();
  });

  it("autoplays the file", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f1" />);

    await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());
    expect(lastContent().autoPlay).toBe(true);
  });

  it("opens the next entry when a file ends, keeping only the smart_collection parameter", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2", "f3"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f1" />);
    await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());
    await endCurrentFile();

    const url = lastNavigation();
    expect(url.pathname).toBe("/files/f2");
    expect(url.searchParams.get("smart_collection")).toBe(id);
    expect(url.searchParams.has("collection")).toBe(false);
    expect(url.searchParams.has("playlist")).toBe(false);
    expect(url.searchParams.has("folder_play")).toBe(false);
  });

  it("keeps the parameter on a click in the queue", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2", "f3"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f1" />);
    await waitFor(() => expect(screen.getByText("Track f3")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Track f3"));

    const url = lastNavigation();
    expect(url.pathname).toBe("/files/f3");
    expect(url.searchParams.get("smart_collection")).toBe(id);
  });

  it("keeps the parameter when the gallery closes on another file", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1"]);
    mockSearchParams.set("smart_collection", id);
    answerFilesAs((fid) => file(fid, { file_type: "image", mime_type: "image/png", filename: `${fid}.png` }));

    render(<FileDetailFullScreen fileId="img1" />);
    await waitFor(() => expect(galleryProps.length).toBeGreaterThan(0));
    const onClose = galleryProps[galleryProps.length - 1].onClose as (id: string | null) => void;
    act(() => onClose("img2"));

    const all = navigations();
    expect(all.length).toBeGreaterThan(0);
    for (const target of all) {
      expect(new URL(target, "http://localhost").searchParams.get("smart_collection")).toBe(id);
    }
  });

  it("wraps from the last entry to the first with loop on, and stops with loop off", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2", "f3"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f3" />);
    await waitFor(() => expect(screen.getByText("3/3 tracks")).toBeInTheDocument());

    expect(screen.getByLabelText("Loop ON")).toBeInTheDocument();
    await endCurrentFile();
    expect(lastNavigation().pathname).toBe("/files/f1");

    mockPush.mockReset();
    mockReplace.mockReset();
    fireEvent.click(screen.getByLabelText("Loop ON"));
    expect(screen.getByLabelText("Loop OFF")).toBeInTheDocument();
    await endCurrentFile();
    expect(navigations()).toEqual([]);
  });

  it("a file not in the queue plays with no current row, and nothing follows it", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2"]);
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="zz" />);
    await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());
    expect(screen.getByText("–/2 tracks")).toBeInTheDocument();
    expect(screen.getByTestId("file-detail-content")).toHaveTextContent("detail:zz");

    await endCurrentFile();
    expect(navigations()).toEqual([]);
  });
});

describe("SPEC-CORE-109 I5 precedence between queue modes", () => {
  it.each(["collection", "playlist"])(
    "%s wins over smart_collection, and its navigation drops smart_collection",
    async (param) => {
      const id = freshId();
      storeQueue(id, "Evening mix", ["f1", "f2"]);
      mockSearchParams.set("smart_collection", id);
      const alone = render(<FileDetailFullScreen fileId="f1" />);
      await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());
      alone.unmount();
      contentProps.length = 0;

      mockGetCollection.mockResolvedValue({
        id: "c1",
        name: "Real Collection",
        description: null,
        drive: "main",
        items: [
          { id: 1, position: 0, file: file("f1") },
          { id: 2, position: 1, file: file("f9") },
        ],
        created_at: "",
        updated_at: "",
      });
      mockSearchParams.set(param, "c1");
      render(<FileDetailFullScreen fileId="f1" />);

      await waitFor(() => expect(screen.getByText("Real Collection")).toBeInTheDocument());
      expect(screen.queryByText("Evening mix")).toBeNull();
      await endCurrentFile();
      const url = lastNavigation();
      expect(url.pathname).toBe("/files/f9");
      expect(url.searchParams.has("smart_collection")).toBe(false);
    },
  );

  it("smart_collection wins over folder_play, and its navigation drops folder_play", async () => {
    const id = freshId();
    storeQueue(id, "Evening mix", ["f1", "f2"]);
    mockSearchParams.set("folder_play", "1");
    mockSearchParams.set("smart_collection", id);

    render(<FileDetailFullScreen fileId="f1" />);
    await waitFor(() => expect(screen.getByText("Evening mix")).toBeInTheDocument());

    await endCurrentFile();
    const url = lastNavigation();
    expect(url.pathname).toBe("/files/f2");
    expect(url.searchParams.get("smart_collection")).toBe(id);
    expect(url.searchParams.has("folder_play")).toBe(false);
  });
});

describe("SPEC-CORE-109 step 6 / I5 no queue found: one evaluation of the saved query", () => {
  function savedSmartFolder(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      drive: "main",
      name: "Evening mix",
      query: "kyoto tag:trip",
      file_type: "video",
      sort_by: "title",
      sort_order: "asc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
      ...overrides,
    };
  }

  it("evaluates the saved query and type with relevance and scene search off, showing the loading line without autoplay meanwhile", async () => {
    const id = freshId();
    mockSearchParams.set("smart_collection", id);
    mockGetSmartFolders.mockResolvedValue([savedSmartFolder("other", { name: "Other" }), savedSmartFolder(id)]);
    const pending = deferred<unknown>();
    mockEvaluate.mockReturnValue(pending.promise);

    render(<FileDetailFullScreen fileId="f1" />);

    await waitFor(() => expect(screen.getByText("Loading the queue…")).toBeInTheDocument());
    expect(lastContent().autoPlay).toBe(false);
    await waitFor(() => expect(mockEvaluate).toHaveBeenCalledTimes(1));
    expect(mockGetSmartFolders).toHaveBeenCalledWith("main");
    expect(mockEvaluate.mock.calls[0][0]).toMatchObject({
      drive: "main",
      query: "kyoto tag:trip",
      type: "video",
      sort: "relevance",
      includeSceneClip: false,
    });
  });

  it("on success shows the media files in order, stores them, keeps the current file still, and autoplays the next", async () => {
    const id = freshId();
    mockSearchParams.set("smart_collection", id);
    mockGetSmartFolders.mockResolvedValue([savedSmartFolder(id)]);
    mockEvaluate.mockResolvedValue({
      complete: true,
      files: [
        file("f1"),
        file("img", { file_type: "image", mime_type: "image/png", title: "Track img" }),
        file("doc", { file_type: "document", mime_type: "application/pdf", title: "Track doc" }),
        file("f2", { file_type: "audio", mime_type: "audio/mpeg", duration: 33 }),
      ],
    });

    const { rerender } = render(<FileDetailFullScreen fileId="f1" />);

    await waitFor(() => expect(screen.getByText("1/2 tracks")).toBeInTheDocument());
    expect(screen.getByText("Evening mix")).toBeInTheDocument();
    expect(screen.queryByText("Track img")).toBeNull();
    expect(screen.queryByText("Track doc")).toBeNull();
    expect(lastContent().autoPlay).toBe(false);

    const stored = JSON.parse(sessionStorage.getItem(`smart-queue:main:${id}`) ?? "null");
    expect(stored).toEqual({
      name: "Evening mix",
      files: [
        { id: "f1", title: "Track f1", file_type: "video", duration: 120 },
        { id: "f2", title: "Track f2", file_type: "audio", duration: 33 },
      ],
    });

    await endCurrentFile();
    const url = lastNavigation();
    expect(url.pathname).toBe("/files/f2");
    expect(url.searchParams.get("smart_collection")).toBe(id);

    rerender(<FileDetailFullScreen fileId="f2" />);
    await waitFor(() => expect(screen.getByText("2/2 tracks")).toBeInTheDocument());
    expect(lastContent().autoPlay).toBe(true);
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });

  it("reads the tab's memory before sessionStorage", async () => {
    const id = freshId();
    mockSearchParams.set("smart_collection", id);
    mockGetSmartFolders.mockResolvedValue([savedSmartFolder(id)]);
    mockEvaluate.mockResolvedValue({ complete: true, files: [file("f1"), file("f2")] });

    const { rerender } = render(<FileDetailFullScreen fileId="f1" />);
    await waitFor(() => expect(screen.getByText("1/2 tracks")).toBeInTheDocument());

    storeQueue(id, "Stale", ["f2", "f7", "f8"]);
    rerender(<FileDetailFullScreen fileId="f2" />);

    await waitFor(() => expect(screen.getByText("2/2 tracks")).toBeInTheDocument());
    expect(screen.getByText("Evening mix")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).toBeNull();
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the Smart Collection is gone", () => mockGetSmartFolders.mockResolvedValue([])],
    ["the evaluation throws", (id: string) => {
      mockGetSmartFolders.mockResolvedValue([savedSmartFolder(id)]);
      mockEvaluate.mockRejectedValue(new Error("listing failed"));
    }],
    ["the evaluation is incomplete", (id: string) => {
      mockGetSmartFolders.mockResolvedValue([savedSmartFolder(id)]);
      mockEvaluate.mockResolvedValue({ complete: false, files: [file("f1")] });
    }],
    ["it holds no video or audio", (id: string) => {
      mockGetSmartFolders.mockResolvedValue([savedSmartFolder(id)]);
      mockEvaluate.mockResolvedValue({
        complete: true,
        files: [file("img", { file_type: "image", mime_type: "image/png" })],
      });
    }],
  ] as const)("%s: the failure line, no autoplay, and no second evaluation on a later navigation", async (_label, arrange) => {
    const id = freshId();
    mockSearchParams.set("smart_collection", id);
    (arrange as (id: string) => void)(id);

    const { rerender } = render(<FileDetailFullScreen fileId="f1" />);

    await waitFor(() => expect(screen.getByText("Could not load the queue")).toBeInTheDocument());
    expect(lastContent().autoPlay).toBe(false);
    expect(sessionStorage.getItem(`smart-queue:main:${id}`)).toBeNull();
    const evaluations = mockEvaluate.mock.calls.length;
    const lookups = mockGetSmartFolders.mock.calls.length;
    expect(evaluations).toBeLessThanOrEqual(1);

    rerender(<FileDetailFullScreen fileId="f2" />);
    await waitFor(() => expect(screen.getByTestId("file-detail-content")).toHaveTextContent("detail:f2"));
    await waitFor(() => expect(screen.getByText("Could not load the queue")).toBeInTheDocument());
    expect(mockEvaluate.mock.calls.length).toBe(evaluations);
    expect(mockGetSmartFolders.mock.calls.length).toBe(lookups);
    expect(lastContent().autoPlay).toBe(false);
  });
});
