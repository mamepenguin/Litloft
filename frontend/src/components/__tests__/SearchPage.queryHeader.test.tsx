import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileKind } from "@/types";

import { FolderBrowser } from "../FolderBrowser";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ name: "main" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/drive/main/search",
}));

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb">trail</nav>,
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

const saveButton = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    saveButton.props = props;
    return <>{children}</>;
  },
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-testid={`slot-${id}`} />,
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeVisible", () => ({
  useTreeVisible: () => ({ visible: false, beside: false, toggle: vi.fn(), yielded: false }),
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title", order: "asc", setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "grid", setViewMode: vi.fn() }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/hooks/useIsInternalDragging", () => ({ useIsInternalDragging: () => false }));
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

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [],
    folders: [],
    total: 42,
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
    snapshotKey: "key",
    hydratedScrollY: null,
    continuationState: "hidden",
    onShowMore: vi.fn(),
    continuationSentinelRef: { current: null },
    continuationDrawnIds: new Set<string>(),
    updateContinuationFile: vi.fn(),
    removeContinuationFiles: vi.fn(),
  }),
}));

const driveTags = vi.hoisted(() => ({ reply: Promise.resolve([] as { name: string; count: number }[]) }));
const getDriveTags = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveTags: (...args: unknown[]) => getDriveTags(...args),
}));

const TAGS = [
  { name: "会議", count: 9 },
  { name: "予算", count: 8 },
  { name: "旅行", count: 7 },
  { name: "料理", count: 6 },
  { name: "設計", count: 5 },
  { name: "日記", count: 4 },
  { name: "写真", count: 3 },
  { name: "音楽", count: 2 },
  { name: "映画", count: 1 },
  { name: "empty", count: 0 },
];

interface PageProps {
  searchQuery?: string;
  typeFilter?: FileKind | null;
  smartFolderId?: string | null;
  includeSceneClip?: boolean;
}

function tree(props: PageProps) {
  return (
    <FolderBrowser
      driveName="main"
      searchQuery={props.searchQuery ?? "cats"}
      typeFilter={props.typeFilter ?? null}
      smartFolderId={props.smartFolderId ?? null}
      includeSceneClip={props.includeSceneClip}
    />
  );
}

function renderSearch(props: PageProps = {}) {
  const view = render(tree(props));
  return { ...view, rerenderSearch: (next: PageProps) => view.rerender(tree(next)) };
}

const field = () => screen.getByRole("textbox", { name: "Search query" });
const chipGroup = () => screen.getByRole("group", { name: "Filters" });
const removeButtons = () => within(chipGroup()).getAllByRole("button");
const addFilterButton = () =>
  screen.getByRole("button", { name: /(\+|Add filter)/ });
function accessibleName(element: Element): string {
  return (
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.textContent?.trim() ??
    ""
  );
}
const pushedUrl = () => {
  const call = router.push.mock.calls.at(-1);
  return call ? new URL(String(call[0]), "http://localhost") : null;
};
const pushedParams = () => pushedUrl()?.searchParams ?? new URLSearchParams();

function chooseSort(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Sort/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

function typeField(value: string) {
  fireEvent.change(field(), { target: { value } });
}

function submit(value: string) {
  typeField(value);
  fireEvent.keyDown(field(), { key: "Enter" });
}

function openFilterMenu() {
  fireEvent.click(addFilterButton());
  return screen.getByRole("menu");
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  getDriveTags.mockReset();
  getDriveTags.mockImplementation(() => driveTags.reply);
  driveTags.reply = Promise.resolve(TAGS);
  saveButton.props = null;
});

describe("SPEC-CORE-039 I16 the search page's subject is a hidden h1 over a field", () => {
  it("renders exactly one h1, visually hidden, naming the URL's query", () => {
    renderSearch({ searchQuery: "cats tag:会議" });

    const headings = screen.getAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Search: "cats tag:会議"');
    expect(headings[0].classList.contains("sr-only")).toBe(true);
  });

  it("puts the URL's query in an editable field named Search query", () => {
    renderSearch({ searchQuery: "cats tag:会議" });

    expect(field()).toHaveValue("cats tag:会議");
  });

  it.each([
    ["the Library root", { folderPath: "" }, "Library"],
    ["a folder", { folderPath: "videos" }, null],
    ["a cross-folder view", { view: "favorites" }, null],
  ])("leaves %s' heading as before", (_name, props, expected) => {
    render(<FolderBrowser driveName="main" {...props} />);

    expect(screen.queryByRole("heading", { level: 1 })?.textContent ?? null).toBe(
      expected,
    );
  });
});

describe("SPEC-CORE-039 I13 the chips are the field's operators", () => {
  it("draws one chip per distinct operator, in the order they first appear", () => {
    renderSearch({ searchQuery: "type:pdf tag:a tag:b type:video is:liked cats" });

    expect(removeButtons().map(accessibleName)).toEqual([
      "Remove Type PDF",
      "Remove Tag a",
      "Remove Tag b",
      "Remove Type Video",
      expect.stringContaining("Liked"),
    ]);
  });

  it("collapses operators that parse to the same chip", () => {
    renderSearch({ searchQuery: "tag:Trip tag:trip type:markdown type:text cats" });

    expect(removeButtons()).toHaveLength(2);
    expect(accessibleName(removeButtons()[0])).toBe("Remove Tag Trip");
    expect(accessibleName(removeButtons()[1])).toBe("Remove Type Text");
  });

  it("shows a chip on the keystroke that types the operator", () => {
    renderSearch({ searchQuery: "cats" });
    expect(screen.queryByRole("group", { name: "Filters" })).toBeNull();

    typeField("cats tag:会議");

    expect(within(chipGroup()).getByRole("button", { name: "Remove Tag 会議" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-039 I8 a chip's ✕ removes exactly its own tokens", () => {
  const rows: Array<[string, string, RegExp | string, string]> = [
    ["a tag", "tag:会議 type:pdf 予算", "Remove Tag 会議", "type:pdf 予算"],
    [
      "every spelling of the same tag",
      "tag:会議 TAG：会議 ＴＡＧ:会議 type:pdf",
      "Remove Tag 会議",
      "type:pdf",
    ],
    [
      "a tag value case-insensitively",
      "tag:Meeting tag:meeting type:pdf",
      "Remove Tag Meeting",
      "type:pdf",
    ],
    [
      "markdown read as text",
      "type:markdown type:text type:PDF type:foo 予算",
      "Remove Type Text",
      "type:PDF type:foo 予算",
    ],
    [
      "a kind beside a text-looking token",
      "type:markdown type:PDF type:foo 予算",
      "Remove Type PDF",
      "type:markdown type:foo 予算",
    ],
    ["a favourite flag", "is:favorite 予算", /Favorites/, "予算"],
    ["a liked flag", "is:liked 予算", /Liked/, "予算"],
  ];

  it.each(rows)("removes %s and submits the rest", (_name, query, removeName, expected) => {
    renderSearch({ searchQuery: query });

    fireEvent.click(within(chipGroup()).getByRole("button", { name: removeName }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(pushedParams().get("q")).toBe(expected);
  });

  it("goes to the drive's library view when the only operator is removed", () => {
    renderSearch({ searchQuery: "tag:会議" });
    chooseSort("Size smallest");

    fireEvent.click(screen.getByRole("button", { name: "Remove Tag 会議" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(pushedUrl()?.pathname).toBe("/drive/main");
    expect(pushedParams().has("q")).toBe(false);
    expect(pushedParams().get("sort")).toBe("file_size");
    expect(pushedParams().get("order")).toBe("asc");
  });

  it("moves focus to the next ✕, then the previous, then the field", () => {
    renderSearch({ searchQuery: "tag:a tag:b tag:c cats" });

    fireEvent.click(screen.getByRole("button", { name: "Remove Tag b" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove Tag c" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Tag c" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove Tag a" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Tag a" }));
    expect(document.activeElement).toBe(field());
  });
});

describe("SPEC-CORE-039 I9 the field follows the URL's query", () => {
  it("replaces unsubmitted edits when the URL's query changes", () => {
    const { rerenderSearch } = renderSearch({ searchQuery: "cats" });
    typeField("cats edited");
    expect(field()).toHaveValue("cats edited");

    rerenderSearch({ searchQuery: "dogs" });

    expect(field()).toHaveValue("dogs");
  });

  it("does not navigate on an unchanged submission", () => {
    renderSearch({ searchQuery: "cats" });

    submit("  cats  ");

    expect(router.push).not.toHaveBeenCalled();
  });

  it("does not navigate on blank text, and keeps the field empty and focused", () => {
    renderSearch({ searchQuery: "cats" });

    submit("");

    expect(router.push).not.toHaveBeenCalled();
    expect(field()).toHaveValue("");
    expect(document.activeElement).toBe(field());
  });

  it("restores the URL's query on Escape", () => {
    renderSearch({ searchQuery: "cats" });
    typeField("cats edited");

    fireEvent.keyDown(field(), { key: "Escape" });

    expect(field()).toHaveValue("cats");
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-039 I20 a submission is exactly one history entry", () => {
  const props: PageProps = {
    searchQuery: "cats",
    typeFilter: "video",
    smartFolderId: "sf1",
    includeSceneClip: true,
  };

  it("pushes once, keeping type, sort, order, smart folder and scene flag", () => {
    renderSearch(props);
    chooseSort("Size smallest");

    submit("cats tag:会議");

    expect(router.push).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect(pushedUrl()?.pathname).toBe("/drive/main/search");
    expect(params.get("q")).toBe("cats tag:会議");
    expect(params.get("type")).toBe("video");
    expect(params.get("sort")).toBe("file_size");
    expect(params.get("order")).toBe("asc");
    expect(params.get("smart_folder_id")).toBe("sf1");
    expect(params.get("include_scene_clip")).toBe("true");
  });

  it("does not let the URL-sync effect rewrite the pushed entry", () => {
    const { rerenderSearch } = renderSearch(props);
    chooseSort("Size smallest");
    submit("cats tag:会議");
    const pushed = pushedUrl()!;
    router.replace.mockClear();

    rerenderSearch({ ...props, searchQuery: "cats tag:会議" });

    for (const call of router.replace.mock.calls) {
      const replaced = new URL(String(call[0]), "http://localhost");
      expect(replaced.pathname).toBe(pushed.pathname);
      expect(Object.fromEntries(replaced.searchParams)).toEqual(
        Object.fromEntries(pushed.searchParams),
      );
    }
  });
});

describe("SPEC-CORE-039 I21 a filtered query renders no search-modes slot", () => {
  it("hides the slot the addons would fill, with … open", () => {
    renderSearch({ searchQuery: "cats tag:会議" });

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(screen.queryByTestId("slot-search-modes")).toBeNull();
  });
});

describe("SPEC-CORE-039 I22 the Smart Folder entry saves the URL's query", () => {
  it("ignores unsubmitted field text", () => {
    renderSearch({ searchQuery: "cats", typeFilter: "video" });
    typeField("cats dogs");

    expect(saveButton.props?.query).toBe("cats");
    expect(saveButton.props?.typeFilter).toBe("video");
  });
});

describe("SPEC-CORE-039 I14 the ＋ 条件 menu", () => {
  it("offers タグ, 種類 and お気に入り from a menu button", () => {
    renderSearch();

    const trigger = addFilterButton();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Tag" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Type" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Favorites" })).toBeInTheDocument();
  });

  it("lists at most 8 tags with a count that the field does not already hold", async () => {
    renderSearch({ searchQuery: "tag:会議 cats" });
    const menu = openFilterMenu();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Tag" }));

    const list = screen.getByRole("menu");
    await within(list).findByRole("menuitem", { name: "予算" });
    const offered = TAGS.map((tag) => tag.name).filter(
      (name) => within(list).queryByRole("menuitem", { name }) !== null,
    );
    expect(offered.sort()).toEqual(
      ["予算", "旅行", "料理", "設計", "日記", "写真", "音楽", "映画"].sort(),
    );
    expect(offered).not.toContain("会議");
    expect(offered).not.toContain("empty");
  });

  it("filters the tag list as the reader types", async () => {
    renderSearch({ searchQuery: "cats" });
    const menu = openFilterMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Tag" }));
    const list = screen.getByRole("menu");
    await within(list).findByRole("menuitem", { name: "予算" });

    fireEvent.change(within(list).getByRole("textbox"), { target: { value: "旅" } });

    expect(await within(list).findByRole("menuitem", { name: "旅行" })).toBeInTheDocument();
    expect(within(list).queryByRole("menuitem", { name: "予算" })).toBeNull();
  });

  it.each([
    ["a chosen kind", null, "type:text 予算", ["Text", "Document"], ["Video", "PDF"]],
    ["the toolbar type", "video", "予算", ["Video", "Document", "Text", "PDF", "Image"], []],
    ["a kind an already chosen kind holds", "document", "type:document 予算", ["Document", "Text", "PDF"], ["Video"]],
  ] as const)(
    "does not offer %s",
    (_name, typeFilter, query, absent, present) => {
      renderSearch({ searchQuery: query, typeFilter });
      const menu = openFilterMenu();

      fireEvent.click(within(menu).getByRole("menuitem", { name: "Type" }));

      const list = screen.getByRole("menu");
      for (const label of absent) {
        expect(within(list).queryByRole("menuitem", { name: label })).toBeNull();
      }
      for (const label of present) {
        expect(within(list).getByRole("menuitem", { name: label })).toBeInTheDocument();
      }
    },
  );

  it("disables お気に入り while is:favorite is in the field", () => {
    renderSearch({ searchQuery: "is:favorite cats" });
    const menu = openFilterMenu();

    expect(within(menu).getByRole("menuitem", { name: "Favorites" })).toBeDisabled();
  });

  it.each([
    ["a tag", "Tag", "会議", "cats tag:会議"],
    ["a kind", "Type", "PDF", "cats type:pdf"],
    ["お気に入り", "Favorites", null, "cats is:favorite"],
  ])("appends %s as one token and submits", async (_name, item, option, expected) => {
    renderSearch({ searchQuery: "cats" });
    const menu = openFilterMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: item }));

    if (option) {
      fireEvent.click(
        await within(screen.getByRole("menu")).findByRole("menuitem", { name: option }),
      );
    }

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(pushedParams().get("q")).toBe(expected);
  });

  it("offers no tag choice while the tag list is loading", () => {
    driveTags.reply = new Promise(() => {});
    renderSearch({ searchQuery: "cats" });
    const menu = openFilterMenu();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Tag" }));

    const list = screen.getByRole("menu");
    expect(within(list).queryByRole("menuitem", { name: "会議" })).toBeNull();
    expect(within(list).getByRole("textbox")).toBeInTheDocument();
  });

  it("offers no tag choice when the tag list failed", () => {
    const failed = Promise.reject(new Error("offline"));
    failed.catch(() => {});
    driveTags.reply = failed;
    renderSearch({ searchQuery: "cats" });
    const menu = openFilterMenu();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Tag" }));

    const list = screen.getByRole("menu");
    expect(within(list).queryByRole("menuitem", { name: "会議" })).toBeNull();
    expect(within(list).queryByRole("menuitem", { name: "予算" })).toBeNull();
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("closes on Escape and returns focus to the button", () => {
    renderSearch();
    const trigger = addFilterButton();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
