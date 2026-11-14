import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";
import type { FileItem } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

// The project-wide mock drops ICU plurals, and both counts are plurals.
vi.mock("next-intl", () => {
  type Tree = { [key: string]: string | Tree };
  const messages = en as unknown as Tree;

  const lookup = (path: string): unknown => {
    let current: unknown = messages;
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
    useLocale: () => "en",
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const url = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ name: "main" }),
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
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), homePaths: new Set<string>(), togglePin: vi.fn(), handleToggleHome: vi.fn() }),
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

const smart = vi.hoisted(() => ({
  folders: [] as SmartFolder[],
  loading: false,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: smart.folders,
    loading: smart.loading,
    error: null,
    refetch: vi.fn(),
    create: smart.create,
    update: smart.update,
    remove: smart.remove,
  }),
}));
vi.mock("@/components/SmartFolderSaveDialog", () => ({
  SmartFolderSaveDialog: ({
    open,
    mode,
    onSubmit,
  }: {
    open: boolean;
    mode?: string;
    onSubmit: (name: string) => void;
  }) =>
    open ? (
      <div data-testid={`save-dialog-${mode ?? "save"}`}>
        <button data-testid="dialog-submit" onClick={() => onSubmit("my folder")}>
          submit
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog" data-title={title}>
        <button data-testid="confirm-ok" onClick={onConfirm}>
          ok
        </button>
      </div>
    ) : null,
}));

interface Passage {
  kind: "text";
  start: null;
  end: null;
  page: null;
  section: null;
  section_title: null;
  chunk_index: number;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: null;
}

const file = (id: string): FileItem => ({
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

import SearchPage from "@/app/drive/[name]/search/page";
import { FolderBrowser } from "../FolderBrowser";

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

function passageGroup(fileId: string, count: number) {
  const passages: Passage[] = Array.from({ length: count }, (_, i) => ({
    kind: "text",
    start: null,
    end: null,
    page: null,
    section: null,
    section_title: null,
    chunk_index: i,
    text: `${fileId} passage ${i}`,
    score: 0.5,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
  }));
  return {
    fileId,
    filename: `${fileId}.txt`,
    fileType: "text",
    file: null,
    bestScore: 0.5,
    passages,
  };
}

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  slotCalls.calls = [];
  pane.fileId = null;
  pane.treeVisible = false;
  snapshot.current = null;
  smart.folders = [];
  smart.loading = false;
  smart.create.mockReset();
  smart.update.mockReset();
  smart.remove.mockReset();
  listing.files = [file("f1"), file("f2")];
  listing.total = 42;
  listing.passagesApplicable = true;
  listing.passageGroups = [passageGroup("a", 2)];
  listing.passagesLoading = false;
  listing.passagesFailed = false;
  listing.calls = [];
});

function renderAt(query: string) {
  url.params = new URLSearchParams(query);
  const view = render(<SearchPage />);
  return {
    ...view,
    navigate(next: string) {
      url.params = new URLSearchParams(next);
      view.rerender(<SearchPage />);
    },
  };
}

const field = () => screen.getByRole("textbox", { name: "Search query" });
const viewSwitch = () => screen.queryByRole("group", { name: "Show" });
const sceneCheckbox = () => screen.queryByRole("checkbox", { name: /Scene/ });
const moreButton = () => screen.getByRole("button", { name: /^More actions$/ });
const menu = () => screen.queryByRole("menu");
const filesCount = () => screen.queryAllByText(/^42 items$/);

function openMore() {
  fireEvent.click(moreButton());
  return screen.getByRole("menu");
}

function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function parsed(raw: unknown) {
  const u = new URL(String(raw), "http://localhost");
  return { pathname: u.pathname, params: u.searchParams };
}
const lastPush = () => parsed(router.push.mock.calls.at(-1)?.[0]);
const lastReplace = () => parsed(router.replace.mock.calls.at(-1)?.[0]);

const KIND_LABEL = /Video|Text|PDF|Image|Document|Audio/;
/** The ✕ of the chip that shows the URL's `type`, found by the kind it names. */
function typeChipRemove(label: RegExp): HTMLElement | null {
  const buttons = screen
    .queryAllByRole("button", { name: label })
    .filter((b) => !/search/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
  return buttons.find((b) => precedes(b, moreButton())) ?? null;
}

/** The lowest element holding all of the given elements. */
function commonAncestor(elements: Element[]): Element {
  let node: Element | null = elements[0];
  while (node && !elements.every((el) => node!.contains(el))) node = node.parentElement;
  return node!;
}

const FULL_URL =
  "q=cats&type=video&sort=file_size&order=asc&smart_folder_id=sf1&include_scene_clip=true";

describe("SPEC-CORE-066 D1 / I1 the regions run field, chips, results bar, shelf, results", () => {
  it.each([
    ["Files with Scene search on", "q=cats&type=video&include_scene_clip=true"],
    ["Files with Scene search off", "q=cats"],
    ["Passages with a type", "q=cats&type=video&show=passages&include_scene_clip=true"],
  ])("%s: nothing precedes the query field", (_name, query) => {
    const { container } = renderAt(query);

    const first = field();
    const before = Array.from(container.querySelectorAll("button, input, [data-testid]")).filter(
      (el) => el !== first && precedes(el, first) && !el.contains(first),
    );
    expect(before.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  });

  it("puts the chip row, then the results bar, then the shelf, then the results", () => {
    renderAt("q=cats&type=video&include_scene_clip=true");

    const order = [
      field(),
      typeChipRemove(/Video/)!,
      viewSwitch()!,
      sceneCheckbox()!,
      moreButton(),
      screen.getByTestId("slot-search-results-top"),
      screen.getByTestId("rows"),
    ];
    expect(order.every(Boolean)).toBe(true);
    for (let i = 1; i < order.length; i++) {
      expect(precedes(order[i - 1], order[i]), `region ${i - 1} before region ${i}`).toBe(true);
    }
  });

  it("draws the view switch, Scene search, the count and … in one bar that does not hold the field", () => {
    renderAt("q=cats");

    const bar = commonAncestor([viewSwitch()!, sceneCheckbox()!, filesCount()[0], moreButton()]);
    expect(bar.contains(field())).toBe(false);
  });
});

describe("SPEC-CORE-066 I2 one switch, one count, one …, and no Filter on the search page", () => {
  it.each([
    ["Files", "q=cats", false],
    ["Passages", "q=cats&show=passages", false],
    ["Files with a file open beside the tree", "q=cats", true],
    ["Passages with a file open beside the tree", "q=cats&show=passages", true],
  ])("%s", (_name, query, fileOpen) => {
    if (fileOpen) {
      pane.fileId = "f1";
      pane.treeVisible = true;
    }
    renderAt(query);

    expect(screen.queryByRole("button", { name: /^Filter/ })).toBeNull();
    expect(screen.queryByPlaceholderText(/filter in this folder/i)).toBeNull();
    expect(viewSwitch()).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^More actions$/ })).toHaveLength(1);
    expect(sceneCheckbox()).not.toBeNull();
    if (query.includes("passages")) {
      expect(screen.getAllByTestId("passage-count").length).toBeGreaterThan(0);
    } else {
      expect(filesCount().length).toBeGreaterThan(0);
    }
    if (fileOpen) {
      expect(screen.queryByRole("button", { name: /^Sort/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^View/ })).toBeNull();
    }
  });

  it("leaves a folder page its Filter menu and filter field, and gives it no switch, Scene search or …-held search entries", () => {
    url.params = new URLSearchParams();
    render(<FolderBrowser driveName="main" folderPath="videos" />);

    expect(screen.getByRole("button", { name: /^Filter/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filter in this folder/i)).toBeInTheDocument();
    expect(viewSwitch()).toBeNull();
    expect(sceneCheckbox()).toBeNull();

    // The search page, by contrast, has neither.
    url.params = new URLSearchParams("q=cats");
    const searchPage = render(<SearchPage />);
    expect(
      within(searchPage.container).queryByRole("button", { name: /^Filter/ }),
    ).toBeNull();
  });
});

describe("SPEC-CORE-066 I3 the URL's type is a chip, and the URL alone decides it", () => {
  it("draws the chip exactly for a valid kind, before the operator chips", () => {
    const rows: Array<[string, RegExp | null]> = [
      ["q=cats tag:会議&type=video", /Video/],
      ["q=cats tag:会議&type=markdown", /Text/],
      ["q=cats tag:会議&type=foo", null],
      ["q=cats tag:会議", null],
    ];
    for (const [query, label] of rows) {
      const view = renderAt(query);
      const chip = label ? typeChipRemove(label) : null;
      if (label) {
        expect(chip, `${query} shows a type chip`).not.toBeNull();
        const operatorChip = screen.getByRole("button", { name: "Remove Tag 会議" });
        expect(precedes(chip!, operatorChip), `${query} type chip first`).toBe(true);
      } else {
        expect(typeChipRemove(KIND_LABEL), `${query} shows no type chip`).toBeNull();
      }
      view.unmount();
    }
  });

  it("filters the listing by the URL's type, not by the drive root's snapshot", () => {
    snapshot.current = {
      key: "main|||",
      scrollY: 0,
      pagesLoaded: 1,
      items: [],
      total: 3,
      folders: [],
      filters: { sort: "file_size", order: "asc", typeFilter: "image", viewMode: "grid" },
      ts: Date.now(),
    };

    const view = renderAt("q=cats&type=video");
    expect(listing.calls.at(-1)?.typeFilter).toBe("video");
    expect(typeChipRemove(/Video/)).not.toBeNull();
    view.unmount();
    listing.calls = [];

    renderAt("q=cats");
    expect(listing.calls.at(-1)?.typeFilter ?? null).toBeNull();
    expect(typeChipRemove(KIND_LABEL)).toBeNull();
  });

  it("follows the URL's type on every change within one mounted page", () => {
    const page = renderAt("q=cats&type=video");
    expect(listing.calls.at(-1)?.typeFilter).toBe("video");
    expect(typeChipRemove(/Video/)).not.toBeNull();

    page.navigate("q=cats&type=image");
    expect(listing.calls.at(-1)?.typeFilter).toBe("image");
    expect(typeChipRemove(/Image/)).not.toBeNull();
    expect(typeChipRemove(/Video/)).toBeNull();

    page.navigate("q=cats");
    expect(listing.calls.at(-1)?.typeFilter ?? null).toBeNull();
    expect(typeChipRemove(KIND_LABEL)).toBeNull();
    for (const call of [...router.replace.mock.calls, ...router.push.mock.calls]) {
      expect(parsed(call[0]).params.get("type"), String(call[0])).not.toBe("image");
    }
  });

  it("✕ pushes one entry without type, keeping everything else, and nothing puts type back", () => {
    const query = `${FULL_URL}&show=passages`;
    const view = renderAt(query);
    router.replace.mockReset();

    fireEvent.click(typeChipRemove(/Video/)!);

    expect(router.push).toHaveBeenCalledTimes(1);
    const { pathname, params } = lastPush();
    expect(pathname).toBe("/drive/main/search");
    expect(params.has("type")).toBe(false);
    expect(params.get("q")).toBe("cats");
    expect(params.get("sort")).toBe("file_size");
    expect(params.get("order")).toBe("asc");
    expect(params.get("smart_folder_id")).toBe("sf1");
    expect(params.get("include_scene_clip")).toBe("true");
    expect(params.get("show")).toBe("passages");

    const pushed = String(router.push.mock.calls[0][0]);
    view.navigate(pushed.split("?")[1]);

    expect(listing.calls.at(-1)?.typeFilter ?? null).toBeNull();
    expect(typeChipRemove(KIND_LABEL)).toBeNull();
    for (const call of [...router.replace.mock.calls, ...router.push.mock.calls.slice(1)]) {
      expect(parsed(call[0]).params.has("type"), String(call[0])).toBe(false);
    }
  });

  it("the Files no-results 「フィルタを解除」 pushes the same URL as ✕", () => {
    listing.files = [];
    listing.total = 0;
    renderAt(FULL_URL);
    router.replace.mockReset();

    fireEvent.click(screen.getByRole("button", { name: en.search.clearFilter }));

    expect(router.push).toHaveBeenCalledTimes(1);
    const { params } = lastPush();
    expect(params.has("type")).toBe(false);
    expect(params.get("q")).toBe("cats");
    expect(params.get("smart_folder_id")).toBe("sf1");
    expect(params.get("include_scene_clip")).toBe("true");
    expect(params.get("sort")).toBe("file_size");
    expect(params.get("order")).toBe("asc");
    for (const call of router.replace.mock.calls) {
      expect(parsed(call[0]).params.has("type")).toBe(false);
    }
  });

  it("Passages' clear-filter pushes the same URL as ✕ and keeps show", () => {
    listing.passageGroups = [];
    renderAt(`${FULL_URL}&show=passages`);
    router.replace.mockReset();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    const { params } = lastPush();
    expect(params.has("type")).toBe(false);
    expect(params.get("show")).toBe("passages");
    expect(params.get("q")).toBe("cats");
    expect(params.get("include_scene_clip")).toBe("true");
    expect(params.get("smart_folder_id")).toBe("sf1");
  });
});

describe("SPEC-CORE-066 I4 the Scene search checkbox sits in the results bar", () => {
  it.each([
    ["Files", "q=cats", false, true],
    ["Passages", "q=cats&show=passages", false, true],
    ["Files with a file open beside the tree", "q=cats", true, true],
    ["Passages with a file open beside the tree", "q=cats&show=passages", true, true],
  ])("%s", (_name, query, fileOpen) => {
    if (fileOpen) {
      pane.fileId = "f1";
      pane.treeVisible = true;
    }
    renderAt(query);

    const checkbox = sceneCheckbox();
    expect(checkbox).not.toBeNull();
    expect(precedes(field(), checkbox!)).toBe(true);
    expect(precedes(checkbox!, moreButton())).toBe(true);
  });

  it.each([
    ["Files", ""],
    ["Passages", "&show=passages"],
  ])(
    "%s: an operator removes it and removing the operator brings it back as it was",
    (_name, view) => {
      const page = renderAt(`q=cats&include_scene_clip=true${view}`);
      expect(precedes(field(), sceneCheckbox()!)).toBe(true);

      page.navigate(`q=cats tag:pets&include_scene_clip=true${view}`);
      expect(sceneCheckbox()).toBeNull();
      expect(moreButton()).toBeInTheDocument();

      page.navigate(`q=cats&include_scene_clip=true${view}`);
      expect(sceneCheckbox()).toBeChecked();
      expect(precedes(sceneCheckbox()!, moreButton())).toBe(true);
    },
  );

  it("toggling it replaces include_scene_clip and nothing else", () => {
    renderAt(`${FULL_URL.replace("&include_scene_clip=true", "")}&show=passages`);
    expect(precedes(field(), sceneCheckbox()!)).toBe(true);

    fireEvent.click(sceneCheckbox()!);

    expect(router.push).not.toHaveBeenCalled();
    const { params } = lastReplace();
    expect(params.get("include_scene_clip")).toBe("true");
    expect(params.get("q")).toBe("cats");
    expect(params.get("type")).toBe("video");
    expect(params.get("smart_folder_id")).toBe("sf1");
    expect(params.get("show")).toBe("passages");
  });
});

describe("SPEC-CORE-066 I6 search-results-top sits under the bar and above the results", () => {
  it.each([
    ["a plain query in Files", "q=cats&type=video&include_scene_clip=true", true, true],
    ["Files with Scene search off", "q=cats&type=video", true, true],
  ])("%s", (_name, query) => {
    renderAt(query);

    const slot = screen.queryByTestId("slot-search-results-top");
    expect(slot).not.toBeNull();
    expect(precedes(moreButton(), slot!)).toBe(true);
    expect(precedes(slot!, screen.getByTestId("rows"))).toBe(true);
    const props = slotCalls.calls.filter((c) => c.id === "search-results-top").at(-1)?.props;
    expect(props?.typeFilter).toBe("video");
    expect(props?.query).toBe("cats");
  });

  it.each([
    ["a query with an operator", "q=cats tag:pets&type=video&include_scene_clip=true", true],
    ["Passages", "q=cats&type=video&show=passages&include_scene_clip=true", true],
    ["show=passages where Passages does not apply", "q=cats&type=video&show=passages", false],
  ])("is not mounted for %s, and comes back under the bar for the plain Files query", (_name, query, applicable) => {
    listing.passagesApplicable = applicable;
    const page = renderAt(query);
    expect(screen.queryByTestId("slot-search-results-top")).toBeNull();
    expect(slotCalls.calls.some((c) => c.id === "search-results-top")).toBe(false);

    listing.passagesApplicable = true;
    page.navigate("q=cats&type=video&include_scene_clip=true");
    const slot = screen.getByTestId("slot-search-results-top");
    expect(precedes(moreButton(), slot)).toBe(true);
    expect(precedes(slot, screen.getByTestId("rows"))).toBe(true);
  });
});

describe("SPEC-CORE-066 I7 / SPEC-CORE-039 I22 the Smart Folder entries in …", () => {
  it("unsaved: Save closes …, opens the save dialog, and saves the URL's q", async () => {
    smart.create.mockResolvedValueOnce({ ...SAMPLE, id: "new-id" });
    renderAt("q=cats&type=video&include_scene_clip=true&show=passages");
    fireEvent.change(field(), { target: { value: "cats dogs" } });

    const opened = openMore();
    fireEvent.click(within(opened).getByRole("menuitem", { name: en.smartFolder.save }));

    expect(menu()).toBeNull();
    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("dialog-submit"));

    await waitFor(() => expect(smart.create).toHaveBeenCalledTimes(1));
    expect(smart.create.mock.calls[0][0]).toMatchObject({ query: "cats", file_type: "video" });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const { pathname, params } = lastReplace();
    expect(pathname).toBe("/drive/main/search");
    expect(params.get("q")).toBe("cats");
    expect(params.get("type")).toBe("video");
    expect(params.get("smart_folder_id")).toBe("new-id");
    expect(params.get("show")).toBe("passages");
    expect(params.get("include_scene_clip")).toBe("true");
  });

  it("an open save dialog outlives a URL change and saves the URL's q at submission", async () => {
    smart.create.mockResolvedValueOnce({ ...SAMPLE, id: "new-id", query: "dogs" });
    const page = renderAt("q=cats");
    fireEvent.click(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save }));
    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();

    page.navigate("q=dogs");
    expect(screen.getByTestId("save-dialog-save")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dialog-submit"));

    await waitFor(() => expect(smart.create).toHaveBeenCalledTimes(1));
    expect(smart.create.mock.calls[0][0]).toMatchObject({ query: "dogs" });
  });

  it("SPEC-CORE-103 I8 saved: shows the name as a non-item row, then Overwrite, Rename, Delete", () => {
    smart.folders = [SAMPLE];
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    const opened = openMore();
    const label = within(opened).getByText(/Saved: My Folder/);
    const labelRow = label.closest("[role]");
    expect(labelRow?.getAttribute("role")).toBe("presentation");
    expect(within(opened).queryByRole("menuitem", { name: /Saved: My Folder/ })).toBeNull();
    for (const name of ["Overwrite", en.smartFolder.rename, en.smartFolder.delete]) {
      expect(within(opened).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(within(opened).queryByRole("menuitem", { name: en.smartFolder.save })).toBeNull();
  });

  it("an unresolved smart_folder_id offers Save, as while the list loads", () => {
    smart.folders = [SAMPLE];
    renderAt("q=cats&smart_folder_id=missing");

    const opened = openMore();
    expect(within(opened).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    expect(within(opened).queryByText(/Saved:/)).toBeNull();
  });

  it("offers no Smart Folder entry for a blank q", () => {
    const page = renderAt("q=cats");
    expect(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    fireEvent.click(moreButton());

    page.navigate("q=");
    const more = screen.queryByRole("button", { name: /^More actions$/ });
    if (more) fireEvent.click(more);
    expect(screen.queryByText(en.smartFolder.save)).toBeNull();
    expect(screen.queryByText(/Saved:/)).toBeNull();
  });

  it("Rename closes … and opens the rename dialog", () => {
    smart.folders = [SAMPLE];
    renderAt("q=cats&type=video&smart_folder_id=sf1");

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: en.smartFolder.rename }));

    expect(menu()).toBeNull();
    expect(screen.getByTestId("save-dialog-rename")).toBeInTheDocument();
  });

  it("SPEC-CORE-103 I3 Overwrite closes … and writes the URL's q, not the field's, with no confirmation", async () => {
    smart.folders = [SAMPLE];
    smart.update.mockResolvedValueOnce({ ...SAMPLE, query: "dogs" });
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    fireEvent.change(field(), { target: { value: "unsubmitted" } });

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: "Overwrite" }));
    expect(menu()).toBeNull();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    await waitFor(() => expect(smart.update).toHaveBeenCalledTimes(1));
    expect(smart.update.mock.calls[0]).toEqual(["sf1", { query: "dogs", file_type: "video" }]);
  });

  it("Delete closes …, and the URL keeps show and include_scene_clip", async () => {
    smart.folders = [SAMPLE];
    smart.remove.mockResolvedValueOnce(undefined);
    renderAt("q=cats&type=video&smart_folder_id=sf1&include_scene_clip=true&show=passages");

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: en.smartFolder.delete }));
    expect(menu()).toBeNull();
    fireEvent.click(screen.getByTestId("confirm-ok"));

    await waitFor(() => expect(smart.remove).toHaveBeenCalledWith("sf1"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const { params } = lastReplace();
    expect(params.has("smart_folder_id")).toBe(false);
    expect(params.get("q")).toBe("cats");
    expect(params.get("type")).toBe("video");
    expect(params.get("show")).toBe("passages");
    expect(params.get("include_scene_clip")).toBe("true");
  });

  it("a failed save shows its toast after … has closed", async () => {
    smart.create.mockRejectedValueOnce(new Error("offline"));
    renderAt("q=cats");

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("dialog-submit"));
    });

    expect(await screen.findByText(en.smartFolder.saveFailed)).toBeInTheDocument();
    expect(menu()).toBeNull();
  });

  it("names a saved search 「保存済み」 in Japanese and \"Saved\" in English", () => {
    expect(ja.smartFolder.saved).toBe("保存済み: {name}");
    expect(en.smartFolder.saved).toBe("Saved: {name}");
  });
});

describe("SPEC-CORE-066 I8 / SPEC-CORE-040 I17 search-modes lives in the open … menu", () => {
  it("is not rendered until … opens, then is the menu's last row with closeMenu", () => {
    renderAt("q=cats&type=video");
    expect(screen.queryByTestId("slot-search-modes")).toBeNull();

    const opened = openMore();
    const slot = within(opened).getByTestId("slot-search-modes");
    const rows = Array.from(opened.querySelectorAll("[role^='menuitem'], [data-testid^='slot-']"));
    expect(rows.at(-1)).toBe(slot);
    expect(slot.getAttribute("data-slot-prop-keys")).toBe("closeMenu,drive,filter,onSelect,query");
    const props = slotCalls.calls.filter((c) => c.id === "search-modes").at(-1)?.props;
    expect(props?.query).toBe("cats");
    expect(props?.drive).toBe("main");
    expect(props?.filter).toBe("video");
  });

  it("closeMenu closes … and onSelect navigates", () => {
    renderAt("q=cats");
    openMore();
    const props = slotCalls.calls.filter((c) => c.id === "search-modes").at(-1)!.props!;

    act(() => {
      (props.closeMenu as () => void)();
    });
    expect(menu()).toBeNull();

    act(() => {
      (props.onSelect as (href: string) => void)("/drive/main/addons/intelligence/find?q=cats");
    });
    expect(router.push).toHaveBeenCalledWith("/drive/main/addons/intelligence/find?q=cats");
  });

  it("is absent with … open for a query with operators", () => {
    renderAt("q=cats tag:pets");

    const opened = openMore();

    expect(within(opened).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    expect(screen.queryByTestId("slot-search-modes")).toBeNull();
    expect(slotCalls.calls.some((c) => c.id === "search-modes")).toBe(false);
  });

  it("in Passages … holds only the Smart Folder entries and Find", () => {
    renderAt("q=cats&show=passages");

    const opened = openMore();

    const items = Array.from(opened.querySelectorAll("[role^='menuitem']")).map((el) =>
      el.textContent?.trim(),
    );
    expect(items).toEqual([en.smartFolder.save]);
    expect(within(opened).getByTestId("slot-search-modes")).toBeInTheDocument();
  });

  it("in Files … has select mode after the Smart Folder entries", () => {
    renderAt("q=cats");

    const opened = openMore();
    const save = within(opened).getByRole("menuitem", { name: en.smartFolder.save });
    const select = within(opened).getByRole("menuitem", { name: /^Select/ });
    expect(precedes(save, select)).toBe(true);
    expect(precedes(select, within(opened).getByTestId("slot-search-modes"))).toBe(true);
  });
});
