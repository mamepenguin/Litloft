/**
 * SPEC-CORE-109 steps 2-3, I2, I3, I4: Play on a Smart Collection's search page.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSmartFolders } from "@/hooks/useSmartFolders";
import { smartFolderServer, type SmartFolderServer } from "@/test/smartFolderServer";
import type { FileItem } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

const intl = vi.hoisted(() => ({ locale: "en" as "en" | "ja" }));

vi.mock("next-intl", async () => {
  type Tree = { [key: string]: string | Tree };
  const enTree = (await import("@/messages-core/en.json")).default as unknown as Tree;
  const jaTree = (await import("@/messages-core/ja.json")).default as unknown as Tree;

  const lookup = (path: string): unknown => {
    let current: unknown = intl.locale === "ja" ? jaTree : enTree;
    for (const part of path.split(".")) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  const format = (text: string, values?: Record<string, unknown>): string =>
    text
      .replace(
        /\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g,
        (_match, name: string, one: string, other: string) => {
          const count = Number(values?.[name] ?? 0);
          return (count === 1 ? one : other).replace(/#/g, String(count));
        },
      )
      .replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? ""));

  const useTranslations = (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const raw = lookup(namespace === undefined ? key : `${namespace}.${key}`);
    return format(typeof raw === "string" ? raw : key, values);
  };

  return {
    useTranslations,
    useLocale: () => intl.locale,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const routeDrive = vi.hoisted(() => ({ name: "main" }));

const url = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ name: routeDrive.name }),
  useSearchParams: () => url.params,
  usePathname: () => "/drive/main/search",
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="rows" data-ids={files.map((f) => f.id).join(",")} />
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="rows" data-ids={files.map((f) => f.id).join(",")} />
  ),
}));
vi.mock("@/components/FileTypeIcon", () => ({ FileTypeIcon: () => <span /> }));

const slotCalls = vi.hoisted(() => ({
  calls: [] as Array<{ id: string; props: Record<string, unknown> | undefined }>,
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, props }: { id: string; props?: Record<string, unknown> }) => {
    slotCalls.calls.push({ id, props });
    return (
      <div
        data-testid={`slot-${id}`}
        data-slot-prop-keys={Object.keys(props ?? {}).sort().join(",")}
      />
    );
  },
}));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: () => true }),
}));

vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav aria-label="Breadcrumb" /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => null }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));

const pane = vi.hoisted(() => ({ fileId: null as string | null, treeVisible: false }));
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: pane.fileId }),
}));
vi.mock("@/hooks/useTreeVisible", () => ({
  useTreeVisible: () => ({ visible: pane.treeVisible, beside: pane.treeVisible, toggle: vi.fn(), yielded: false }),
}));
vi.mock("@/hooks/useTreeEnabled", () => ({
  useTreeEnabled: () => ({ enabled: pane.treeVisible }),
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "file_size" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "grid" as const, setViewMode: vi.fn() }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/hooks/useIsInternalDragging", () => ({ useIsInternalDragging: () => false }));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));

const snapshot = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "main|||",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => snapshot.current,
  saveListSnapshot: vi.fn(),
}));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), togglePin: vi.fn() }),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: () => ({
    creatingFolder: false,
    newFolderName: "",
    folderError: null,
    setCreatingFolder: vi.fn(),
    setNewFolderName: vi.fn(),
    setFolderError: vi.fn(),
    handleCreateFolder: vi.fn(),
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveTags: () => Promise.resolve([]),
}));

vi.mock("@/components/SmartFolderSaveDialog", () => ({
  SmartFolderSaveDialog: ({ open, mode }: { open: boolean; mode?: string }) =>
    open ? <div data-testid={`save-dialog-${mode ?? "save"}`} /> : null,
}));
vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="confirm-dialog" data-title={title} /> : null,
}));

const file = (id: string, overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
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
  modified_at: null,
  ...overrides,
});

const listing = vi.hoisted(() => ({
  files: [] as unknown[],
  total: 42,
  passagesApplicable: true,
  passageGroups: [] as unknown[],
  passagesLoading: false,
  passagesFailed: false,
  calls: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: (args: Record<string, unknown>) => {
    listing.calls.push(args);
    return {
      files: listing.files,
      folders: [],
      total: listing.total,
      loading: false,
      loadingMore: false,
      hasMore: false,
      pagesLoaded: 1,
      sentinelRef: { current: null },
      reset: vi.fn(),
      setFiles: vi.fn(),
      setPaginatedTotal: vi.fn(),
      setFolders: vi.fn(),
      isRecent: false,
      hasProfile: false,
      snapshotKey: "main|||",
      hydratedScrollY: null,
      continuationState: "hidden",
      onShowMore: vi.fn(),
      continuationSentinelRef: { current: null },
      continuationDrawnIds: new Set<string>(),
      updateContinuationFile: vi.fn(),
      removeContinuationFiles: vi.fn(),
      passagesApplicable: listing.passagesApplicable,
      passageGroups: listing.passageGroups,
      passagesLoading: listing.passagesLoading,
      passagesFailed: listing.passagesFailed,
      retryPassages: vi.fn(),
    };
  },
}));

const evaluation = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/smartCollectionEval", () => ({
  evaluateSmartCollection: (...args: unknown[]) => evaluation.fn(...args),
}));

import SearchPage from "@/app/drive/[name]/search/page";

const SAMPLE: SmartFolder = {
  id: "sf1",
  drive: "main",
  name: "My Folder",
  query: "cats",
  file_type: "video",
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
};

let server: SmartFolderServer;

const sidebar = { current: null as ReturnType<typeof useSmartFolders> | null };
function SidebarList() {
  sidebar.current = useSmartFolders("main");
  return null;
}

function useServer(rows: SmartFolder[]) {
  server = smartFolderServer({ main: rows });
  vi.stubGlobal("fetch", vi.fn(server.fetch));
}

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
  intl.locale = "en";
  pane.fileId = null;
  pane.treeVisible = false;
  snapshot.current = null;
  sidebar.current = null;
  listing.files = [file("f1"), file("f2")];
  listing.total = 42;
  listing.passagesApplicable = true;
  listing.passageGroups = [];
  listing.passagesLoading = false;
  listing.passagesFailed = false;
  listing.calls = [];
  routeDrive.name = "main";
  evaluation.fn.mockReset();
  sessionStorage.clear();
  useServer([SAMPLE]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(query: string, { withSidebar = false } = {}) {
  url.params = new URLSearchParams(query);
  const tree = () => (
    <>
      <SearchPage />
      {withSidebar && <SidebarList />}
    </>
  );
  const view = render(tree());
  return {
    ...view,
    navigate(next: string) {
      url.params = new URLSearchParams(next);
      view.rerender(tree());
    },
  };
}


const image = (id: string) => file(id, { file_type: "image", mime_type: "image/png", filename: `${id}.png` });
const audio = (id: string) => file(id, { file_type: "audio", mime_type: "audio/mpeg", filename: `${id}.mp3`, duration: 33 });

const PREPARING = "Preparing playback…";
const INCOMPLETE = "Could not load all results, so playback did not start. Try again.";
const FAILED = "Could not start playback";
const NOTHING = "There is no video or audio to play.";

const QUEUE_KEY = "smart-queue:main:sf1";

const playButton = () => screen.queryByRole("button", { name: "Play" });
const findPlayButton = () => screen.findByRole("button", { name: "Play" });
const moreButton = () => screen.getByRole("button", { name: /^More actions$/ });

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function chooseSort(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Sort/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

function navigations(): string[] {
  return [...router.push.mock.calls, ...router.replace.mock.calls].map((c) => String(c[0]));
}

function playerNavigations(): string[] {
  return navigations().filter((target) => target.startsWith("/files/"));
}

describe("SPEC-CORE-109 I2 Play shows only on a Smart Collection's unedited Files view with media loaded", () => {
  it("shows Play on the bar after the count and before the … button, and as the … sheet's first row", async () => {
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    const play = await findPlayButton();
    expect(play.compareDocumentPosition(moreButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(moreButton());
    const rows = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(rows[0]).toHaveAccessibleName("Play");
  });

  it("shows Play when only audio is loaded", async () => {
    listing.files = [image("i1"), audio("a1")];
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    expect(await findPlayButton()).toBeInTheDocument();
  });

  it("shows Play with the Files view shown even though show=passages asks otherwise", async () => {
    useServer([{ ...SAMPLE, query: "tag:trip", file_type: null }]);
    listing.passagesApplicable = false;
    renderAt("q=tag%3Atrip&show=passages&smart_folder_id=sf1");

    expect(await findPlayButton()).toBeInTheDocument();
  });

  it.each([
    ["a plain search", "q=cats&type=video"],
    ["an id that names no Smart Collection", "q=cats&type=video&smart_folder_id=nope"],
    ["an edited query", "q=dogs&type=video&smart_folder_id=sf1"],
    ["an edited type", "q=cats&type=image&smart_folder_id=sf1"],
    ["no type where one was saved", "q=cats&smart_folder_id=sf1"],
    ["the Passages view", "q=cats&type=video&show=passages&smart_folder_id=sf1"],
  ])("hides Play on %s", async (_label, query) => {
    const page = renderAt("q=cats&type=video&smart_folder_id=sf1");
    expect(await findPlayButton()).toBeInTheDocument();

    page.navigate(query);
    await settle();

    await waitFor(() => expect(playButton()).toBeNull());
    fireEvent.click(moreButton());
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: "Play" })).toBeNull();
  });

  it("hides Play when the loaded results hold no video or audio", async () => {
    const page = renderAt("q=cats&type=video&smart_folder_id=sf1");
    expect(await findPlayButton()).toBeInTheDocument();

    listing.files = [image("i1"), file("d1", { file_type: "document", mime_type: "application/pdf" })];
    page.navigate("q=cats&type=video&smart_folder_id=sf1");

    await waitFor(() => expect(playButton()).toBeNull());
  });

  it("treats q differing only by surrounding spaces as unedited", async () => {
    renderAt("q=%20%20cats%20&type=video&smart_folder_id=sf1");

    expect(await findPlayButton()).toBeInTheDocument();
  });
});

describe("SPEC-CORE-109 step 3 / I2 pressing Play evaluates once with the page's sort, order and scene search", () => {
  it("sends the saved query, type, and the page's current sort, order and scene-search value", async () => {
    evaluation.fn.mockReturnValue(new Promise(() => {}));
    renderAt("q=cats&type=video&smart_folder_id=sf1&include_scene_clip=true");
    await findPlayButton();
    chooseSort("Title Z→A");
    await settle();

    fireEvent.click(await findPlayButton());

    await waitFor(() => expect(evaluation.fn).toHaveBeenCalledTimes(1));
    expect(evaluation.fn.mock.calls[0][0]).toMatchObject({
      drive: "main",
      query: "cats",
      type: "video",
      sort: "title",
      order: "desc",
      includeSceneClip: true,
    });
  });

  it("sends relevance by default", async () => {
    evaluation.fn.mockReturnValue(new Promise(() => {}));
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(await findPlayButton());

    await waitFor(() => expect(evaluation.fn).toHaveBeenCalledTimes(1));
    expect(evaluation.fn.mock.calls[0][0]).toMatchObject({ sort: "relevance", includeSceneClip: false });
  });

  it("is disabled while evaluating, ignores further presses, and shows the preparing toast until it ends", async () => {
    const pending = deferred<unknown>();
    evaluation.fn.mockReturnValue(pending.promise);
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    const play = await findPlayButton();
    fireEvent.click(play);
    fireEvent.click(play);
    await waitFor(() => expect(playButton()).toBeDisabled());
    fireEvent.click(playButton()!);
    expect(await screen.findByText(PREPARING)).toBeInTheDocument();
    expect(evaluation.fn).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve({ files: [image("i1")], complete: true }));
    await waitFor(() => expect(screen.queryByText(PREPARING)).toBeNull());
    expect(playButton()).toBeEnabled();
  });
});

describe("SPEC-CORE-109 step 3 / I3 a successful Play stores the queue and opens the first file", () => {
  it("keeps the video and audio in order, stores them under the tab's key, and opens the first", async () => {
    evaluation.fn.mockResolvedValue({
      complete: true,
      files: [
        image("i1"),
        file("v1", { title: "First" }),
        file("d1", { file_type: "document", mime_type: "application/pdf" }),
        audio("a1"),
        file("v2", { title: "Third", duration: 7 }),
      ],
    });
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(await findPlayButton());

    await waitFor(() => expect(playerNavigations()).toEqual(["/files/v1?smart_collection=sf1"]));
    expect(JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "null")).toEqual({
      name: "My Folder",
      files: [
        { id: "v1", title: "First", file_type: "video", duration: 60 },
        { id: "a1", title: "a1", file_type: "audio", duration: 33 },
        { id: "v2", title: "Third", file_type: "video", duration: 7 },
      ],
    });
  });

  it("replaces the previous queue on the next Play", async () => {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ name: "Old", files: [{ id: "old", title: "old", file_type: "video", duration: 1 }] }));
    evaluation.fn.mockResolvedValue({ complete: true, files: [file("v9")] });
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(await findPlayButton());

    await waitFor(() => expect(playerNavigations()).toEqual(["/files/v9?smart_collection=sf1"]));
    expect(JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "null").files.map((f: { id: string }) => f.id)).toEqual(["v9"]);
  });

  it("removes the stale entry when the storage write fails, then still opens the first file", async () => {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ name: "Old", files: [{ id: "old", title: "old", file_type: "video", duration: 1 }] }));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    evaluation.fn.mockResolvedValue({ complete: true, files: [file("v1")] });
    try {
      renderAt("q=cats&type=video&smart_folder_id=sf1");

      fireEvent.click(await findPlayButton());

      await waitFor(() => expect(playerNavigations()).toEqual(["/files/v1?smart_collection=sf1"]));
    } finally {
      setItem.mockRestore();
    }
    expect(sessionStorage.getItem(QUEUE_KEY)).toBeNull();
  });
});

describe("SPEC-CORE-109 step 3 / I4 a Play that cannot start opens nothing and says why", () => {
  it.each([
    ["an incomplete evaluation", "en", () => evaluation.fn.mockResolvedValue({ complete: false, files: [file("v1")] }), INCOMPLETE],
    ["a listing failure", "en", () => evaluation.fn.mockRejectedValue(new Error("API error: 500")), FAILED],
    ["no video or audio", "en", () => evaluation.fn.mockResolvedValue({ complete: true, files: [image("i1")] }), NOTHING],
    ["no members at all", "en", () => evaluation.fn.mockResolvedValue({ complete: true, files: [] }), NOTHING],
    ["an incomplete evaluation", "ja", () => evaluation.fn.mockResolvedValue({ complete: false, files: [file("v1")] }), "結果をすべて読み込めなかったため、再生できません。もう一度お試しください。"],
    ["a listing failure", "ja", () => evaluation.fn.mockRejectedValue(new Error("API error: 500")), "再生を始められませんでした"],
    ["no video or audio", "ja", () => evaluation.fn.mockResolvedValue({ complete: true, files: [image("i1")] }), "再生できる動画や音声がありません"],
  ] as const)("%s (%s)", async (_label, locale, arrange, message) => {
    intl.locale = locale;
    arrange();
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(await screen.findByRole("button", { name: locale === "ja" ? "再生" : "Play" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    await settle();
    expect(playerNavigations()).toEqual([]);
    expect(sessionStorage.getItem(QUEUE_KEY)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: locale === "ja" ? "再生" : "Play" })).toBeEnabled(),
    );
  });

  it("shows 「再生を準備しています…」 in Japanese while evaluating", async () => {
    intl.locale = "ja";
    evaluation.fn.mockReturnValue(new Promise(() => {}));
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(await screen.findByRole("button", { name: "再生" }));

    expect(await screen.findByText("再生を準備しています…")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-109 step 3 / I2 a change before the evaluation ends discards its result", () => {
  async function pressAndHold(query = "q=cats&type=video&smart_folder_id=sf1") {
    const pending = deferred<unknown>();
    evaluation.fn.mockReturnValue(pending.promise);
    const page = renderAt(query);
    fireEvent.click(await findPlayButton());
    await waitFor(() => expect(evaluation.fn).toHaveBeenCalledTimes(1));
    return { page, pending };
  }

  async function finishAndExpectNothing(pending: ReturnType<typeof deferred<unknown>>) {
    await act(async () => pending.resolve({ complete: true, files: [file("v1")] }));
    await settle();
    expect(playerNavigations()).toEqual([]);
    expect(sessionStorage.getItem(QUEUE_KEY)).toBeNull();
  }

  it.each([
    ["q", "q=dogs&type=video&smart_folder_id=sf1"],
    ["type", "q=cats&type=image&smart_folder_id=sf1"],
    ["the scene-search value", "q=cats&type=video&smart_folder_id=sf1&include_scene_clip=true"],
    ["the view", "q=cats&type=video&smart_folder_id=sf1&show=passages"],
    ["smart_folder_id", "q=cats&type=video"],
  ])("a change of %s", async (_label, next) => {
    const { page, pending } = await pressAndHold();
    page.navigate(next);
    await finishAndExpectNothing(pending);
  });

  it("a change of the sort", async () => {
    const { pending } = await pressAndHold();
    chooseSort("Title A→Z");
    await finishAndExpectNothing(pending);
  });

  it("a change of the order", async () => {
    const pending = deferred<unknown>();
    evaluation.fn.mockReturnValue(pending.promise);
    renderAt("q=cats&type=video&smart_folder_id=sf1");
    await findPlayButton();
    chooseSort("Newest first");
    await settle();
    fireEvent.click(await findPlayButton());
    await waitFor(() => expect(evaluation.fn).toHaveBeenCalledTimes(1));
    expect(evaluation.fn.mock.calls[0][0]).toMatchObject({ sort: "created_at", order: "desc" });

    chooseSort("Oldest first");
    await finishAndExpectNothing(pending);
  });

  it("a change of the drive", async () => {
    server = smartFolderServer({ main: [SAMPLE], other: [{ ...SAMPLE, drive: "other" }] });
    vi.stubGlobal("fetch", vi.fn(server.fetch));
    const { page, pending } = await pressAndHold();
    routeDrive.name = "other";
    page.navigate("q=cats&type=video&smart_folder_id=sf1");
    await finishAndExpectNothing(pending);
    expect(sessionStorage.getItem("smart-queue:other:sf1")).toBeNull();
  });

  it.each([
    ["name", { name: "Renamed" }],
    ["query", { query: "cats tag:x" }],
    ["type", { file_type: "image" }],
  ] as const)("a change of the saved %s made elsewhere", async (_label, patch) => {
    const pending = deferred<unknown>();
    evaluation.fn.mockReturnValue(pending.promise);
    renderAt("q=cats&type=video&smart_folder_id=sf1", { withSidebar: true });
    fireEvent.click(await findPlayButton());
    await waitFor(() => expect(evaluation.fn).toHaveBeenCalledTimes(1));

    await act(async () => {
      await sidebar.current!.update("sf1", patch as Partial<SmartFolder>);
    });
    await settle();

    await finishAndExpectNothing(pending);
  });

  it("unmounting", async () => {
    const { page, pending } = await pressAndHold();
    page.unmount();
    await finishAndExpectNothing(pending);
  });

  it("a re-render with nothing changed keeps the result", async () => {
    const { page, pending } = await pressAndHold();
    page.navigate("q=cats&type=video&smart_folder_id=sf1");
    await act(async () => pending.resolve({ complete: true, files: [file("v1")] }));

    await waitFor(() => expect(playerNavigations()).toEqual(["/files/v1?smart_collection=sf1"]));
  });
});
