import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import en from "@/messages-core/en.json";
import { FolderBrowser } from "../FolderBrowser";
import type { FileItem } from "@/types";

// The project-wide mock renders `{count}` but not an ICU plural, and the count
// line's English text is a plural; a raw catalogue string would put no number
// in the DOM for an assertion to read.
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

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));

vi.mock("@/components/search/PassageList", () => ({
  PassageList: (props: Record<string, unknown>) => (
    <div
      data-testid="passage-list"
      data-state={String(props.state)}
      data-groups={(props.groups as unknown[]).length}
    />
  ),
}));

vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: () => <div data-testid="selection-bar" />,
}));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => null }));

const stableRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const paramsState = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => paramsState.current,
  usePathname: () => "/drive/main/search",
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeEnabled", () => ({ useTreeEnabled: () => ({ enabled: false }) }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
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
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/hooks/useIsInternalDragging", () => ({
  useIsInternalDragging: () => false,
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "relevance" as const, order: "desc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));

const selection = vi.hoisted(() => ({
  selectedIds: new Set<string>(),
  count: 0,
  clear: vi.fn(),
  toggle: vi.fn(),
  selectRange: vi.fn(),
  selectAll: vi.fn(),
}));
vi.mock("@/hooks/useSelection", () => ({ useSelection: () => selection }));

const listing = vi.hoisted(() => ({
  total: 0,
  loading: false,
  passagesApplicable: true,
  passageGroups: [] as PassageGroup[],
  passagesLoading: false,
  passagesFailed: false,
  retryPassages: vi.fn(),
}));

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    folders: [],
    total: listing.total,
    loading: listing.loading,
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
    snapshotKey: "key",
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
    retryPassages: listing.retryPassages,
  }),
}));

interface Passage {
  kind: "utterance" | "scene" | "page" | "section" | "picture_text" | "text";
  start: number | null;
  end: number | null;
  page: number | null;
  section: number | null;
  section_title: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: string | null;
}

interface PassageGroup {
  fileId: string;
  filename: string;
  fileType: string;
  file: FileItem | null;
  bestScore: number;
  passages: Passage[];
}

function passage(text: string): Passage {
  return {
    kind: "text",
    start: null,
    end: null,
    page: null,
    section: null,
    section_title: null,
    chunk_index: 0,
    text,
    score: 0.5,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
  };
}

function group(fileId: string, count: number): PassageGroup {
  return {
    fileId,
    filename: `${fileId}.txt`,
    fileType: "text",
    file: null,
    bestScore: 0.5,
    passages: Array.from({ length: count }, (_, i) => passage(`${fileId} ${i}`)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selection.selectedIds = new Set();
  selection.count = 0;
  listing.total = 0;
  listing.loading = false;
  listing.passagesApplicable = true;
  listing.passageGroups = [];
  listing.passagesLoading = false;
  listing.passagesFailed = false;
  paramsState.current = new URLSearchParams("q=cats&show=passages");
});

const lastReplaced = () => {
  const raw = stableRouter.replace.mock.calls.at(-1)?.[0] as string | undefined;
  if (!raw) return null;
  const url = new URL(raw, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

function renderAt(overrides: Record<string, unknown> = {}) {
  return render(
    <FolderBrowser driveName="main" searchQuery="cats" show="passages" {...overrides} />,
  );
}

const control = () => screen.queryByRole("group", { name: "Show" });

describe("SPEC-CORE-040 I9 the view control and the URL", () => {
  it("offers Files and Passages with Passages chosen from show=passages", () => {
    renderAt();

    expect(control()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Files" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Passages" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("starts on Files when the URL carries no view", () => {
    paramsState.current = new URLSearchParams("q=cats");
    renderAt({ show: undefined });

    expect(screen.getByRole("button", { name: "Files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("drops show from the URL when Files is chosen, keeping every other parameter", () => {
    renderAt({ typeFilter: "video", smartFolderId: "sf1", includeSceneClip: true });
    stableRouter.replace.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    const url = lastReplaced();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.has("show")).toBe(false);
    expect(url?.params.get("q")).toBe("cats");
    expect(url?.params.get("type")).toBe("video");
    expect(url?.params.get("smart_folder_id")).toBe("sf1");
    expect(url?.params.get("include_scene_clip")).toBe("true");
  });

  it("adds show=passages when Passages is chosen, keeping every other parameter", () => {
    paramsState.current = new URLSearchParams("q=cats");
    renderAt({ show: undefined, typeFilter: "video" });
    stableRouter.replace.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Passages" }));

    const url = lastReplaced();
    expect(url?.pathname).toBe("/drive/main/search");
    expect(url?.params.get("show")).toBe("passages");
    expect(url?.params.get("q")).toBe("cats");
    expect(url?.params.get("type")).toBe("video");
  });

  it("scrolls the result list to the top when the view is chosen", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderAt();
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    scrollTo.mockRestore();
  });

  it("keeps show and the URL's type when the Scene flag changes", () => {
    const view = renderAt({ typeFilter: "video" });
    stableRouter.replace.mockClear();

    view.rerender(
      <FolderBrowser
        driveName="main"
        searchQuery="cats"
        show="passages"
        typeFilter="video"
        includeSceneClip
      />,
    );

    expect(lastReplaced()?.params.get("show")).toBe("passages");
    expect(lastReplaced()?.params.get("type")).toBe("video");
  });
});

describe("SPEC-CORE-040 I9 the control appears only while a meaning search runs", () => {
  it("hides the control and shows Files when the view does not apply", () => {
    listing.passagesApplicable = false;
    renderAt();

    expect(control()).toBeNull();
    expect(screen.getByTestId("folder-content")).toBeInTheDocument();
    expect(screen.queryByTestId("passage-list")).toBeNull();
  });

  it("leaves show in the URL while the view does not apply", () => {
    listing.passagesApplicable = false;
    const view = renderAt();
    stableRouter.replace.mockClear();

    view.rerender(
      <FolderBrowser driveName="main" searchQuery="cats" show="passages" includeSceneClip />,
    );

    expect(lastReplaced()?.params.get("show")).toBe("passages");
  });
});

describe("SPEC-CORE-040 I20 Passages loading is never Files first", () => {
  it("shows the passage list in its loading state while the answer is pending", () => {
    listing.passagesLoading = true;
    listing.passageGroups = [group("a", 2)];
    renderAt();

    expect(screen.getByTestId("passage-list")).toHaveAttribute("data-state", "loading");
    expect(screen.queryByTestId("folder-content")).toBeNull();
  });

  it("shows the passage list once the answer settles", () => {
    listing.passageGroups = [group("a", 2)];
    renderAt();

    expect(screen.getByTestId("passage-list")).toHaveAttribute("data-state", "listed");
    expect(screen.queryByTestId("folder-content")).toBeNull();
  });

  it("shows the failure state with nothing in the list", () => {
    listing.passagesFailed = true;
    renderAt();

    expect(screen.getByTestId("passage-list")).toHaveAttribute("data-state", "failed");
  });
});

describe("SPEC-CORE-040 I24 what a view change leaves behind", () => {
  it("clears the selection and leaves select mode on switching to Passages", () => {
    paramsState.current = new URLSearchParams("q=cats");
    renderAt({ show: undefined });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Selection mode" }));
    expect(screen.getByTestId("selection-bar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Passages" }));

    expect(selection.clear).toHaveBeenCalled();
    expect(screen.queryByTestId("selection-bar")).toBeNull();
  });
});

describe("SPEC-CORE-040 I10 the count line", () => {
  const countText = () =>
    screen
      .queryAllByTestId("passage-count")
      .map((node) => node.textContent ?? "")
      .join(" ");

  it("counts the files and every passage of the answer", () => {
    listing.passageGroups = [group("a", 4), group("b", 1)];
    renderAt();

    const text = countText();
    expect(text).toContain("2");
    expect(text).toContain("5");
  });

  it("reads zero files and zero passages when nothing matched", () => {
    listing.passageGroups = [];
    renderAt();

    expect(countText()).toMatch(/0\D+0/);
  });

  it.each([
    ["loading", { passagesLoading: true }],
    ["failed", { passagesFailed: true }],
  ])("is hidden while %s", (_state, overrides) => {
    Object.assign(listing, overrides);
    renderAt();

    expect(countText()).toBe("");
  });
});
