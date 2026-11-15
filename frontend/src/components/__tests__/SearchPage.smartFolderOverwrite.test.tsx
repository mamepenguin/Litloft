import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";
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

const OVERWRITE_NAME = (name: string) => `Overwrite “${name}”`;
const button = (name = "My Folder") =>
  screen.queryByRole("button", { name: OVERWRITE_NAME(name) });
const findButton = (name = "My Folder") =>
  screen.findByRole("button", { name: OVERWRITE_NAME(name) });
const moreButton = () => screen.getByRole("button", { name: /^More actions$/ });
const addFilter = () => screen.getByRole("button", { name: "Add filter" });
const field = () => screen.getByRole("textbox", { name: "Search query" });
const patches = () => server.writes.filter((w) => w.method === "PATCH");
const routerCalls = () => router.push.mock.calls.length + router.replace.mock.calls.length;

function openMore() {
  fireEvent.click(moreButton());
  return screen.getByRole("menu");
}
function closeMore() {
  if (screen.queryByRole("menu")) fireEvent.click(moreButton());
}

async function overwriteRow() {
  const opened = openMore();
  await within(opened).findByText(/Saved: /);
  return within(opened).getByRole("menuitem", { name: "Overwrite" });
}

function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

describe("SPEC-CORE-103 I1 the button and the menu row follow whether the URL's q / type differ from the folder's", () => {
  it("shows the button after 「＋ 条件」 and before the results bar, and enables the row, when q differs", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1");

    const shown = await findButton();
    expect(shown).toBeEnabled();
    expect(precedes(addFilter(), shown)).toBe(true);
    expect(precedes(shown, moreButton())).toBe(true);
    expect(await overwriteRow()).toBeEnabled();
  });

  it("goes Unchanged ↔ Changed with the URL, without a PATCH", async () => {
    const page = renderAt("q=cats&type=video&smart_folder_id=sf1");
    expect(await overwriteRow()).toBeDisabled();
    closeMore();
    expect(button()).toBeNull();

    page.navigate("q=dogs&type=video&smart_folder_id=sf1");
    expect(await findButton()).toBeEnabled();

    page.navigate("q=cats&type=video&smart_folder_id=sf1");
    await waitFor(() => expect(button()).toBeNull());
    expect(await overwriteRow()).toBeDisabled();
    expect(patches()).toHaveLength(0);
  });

  it.each([
    ["saved video, URL has no type → changed", "video", "q=cats", true],
    ["saved video, URL type=image → changed", "video", "q=cats&type=image", true],
    ["saved null, URL type=video → changed", null, "q=cats&type=video", true],
    ["saved null, URL has no type → unchanged", null, "q=cats", false],
    ["URL q differs only by surrounding spaces → unchanged", "video", "q=%20%20cats%20&type=video", false],
  ] as const)("%s", async (_label, savedType, query, changed) => {
    useServer([{ ...SAMPLE, file_type: savedType }]);
    renderAt(`${query}&smart_folder_id=sf1`);

    const row = await overwriteRow();
    if (changed) {
      expect(row).toBeEnabled();
      closeMore();
      expect(await findButton()).toBeInTheDocument();
    } else {
      expect(row).toBeDisabled();
      closeMore();
      expect(button()).toBeNull();
    }
  });

  it("does not count show, scene search or unsubmitted typing as a difference", async () => {
    const page = renderAt("q=cats&type=video&smart_folder_id=sf1");
    expect(await overwriteRow()).toBeDisabled();
    closeMore();

    page.navigate(
      "q=cats&type=video&smart_folder_id=sf1&show=passages&include_scene_clip=true",
    );
    fireEvent.change(field(), { target: { value: "dogs" } });
    await settle();

    expect(button()).toBeNull();
    expect(await overwriteRow()).toBeDisabled();
    closeMore();

    page.navigate("q=dogs&type=video&smart_folder_id=sf1&show=passages");
    expect(await findButton()).toBeInTheDocument();
  });
});

describe("SPEC-CORE-103 I2 without a resolved folder there is no button and Save is offered", () => {
  it("drops the button and offers Save once the URL has no smart_folder_id", async () => {
    const page = renderAt("q=dogs&type=video&smart_folder_id=sf1");
    await findButton();

    page.navigate("q=dogs&type=video");
    await waitFor(() => expect(button()).toBeNull());
    const opened = openMore();
    expect(within(opened).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    expect(within(opened).queryByRole("menuitem", { name: "Overwrite" })).toBeNull();
  });

  it("shows nothing while the first load is in flight, then the button once it resolves", async () => {
    server.state.holdGets = true;
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    await waitFor(() => expect(server.heldGetCount()).toBeGreaterThan(0));

    expect(button()).toBeNull();
    const opened = openMore();
    expect(within(opened).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    closeMore();

    await act(async () => {
      server.releaseGet(0, [SAMPLE]);
    });
    expect(await findButton()).toBeInTheDocument();
  });

  it("after a failed first load shows nothing, and a refetch from another instance's write brings the folder in", async () => {
    server.state.failGets = 1;
    const page = renderAt("q=dogs&type=video&smart_folder_id=sf1");
    await waitFor(() => expect(server.getCount("main")).toBe(1));
    await settle();
    expect(button()).toBeNull();
    expect(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    closeMore();

    url.params = new URLSearchParams("q=dogs&type=video&smart_folder_id=sf1");
    page.rerender(
      <>
        <SearchPage />
        <SidebarList />
      </>,
    );
    await waitFor(() => expect(sidebar.current?.smartFolders).toHaveLength(1));
    await act(async () => {
      await sidebar.current!.update("sf1", { name: "Renamed" });
    });

    expect(await findButton("Renamed")).toBeInTheDocument();
  });

  it("an id that matches no folder offers Save, and an id that does shows the button", async () => {
    const page = renderAt("q=dogs&type=video&smart_folder_id=nope");
    await waitFor(() => expect(server.getCount("main")).toBeGreaterThan(0));
    await settle();
    expect(button()).toBeNull();
    expect(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    closeMore();

    page.navigate("q=dogs&type=video&smart_folder_id=sf1");
    expect(await findButton()).toBeInTheDocument();
  });

  it("falls to No folder when the open folder is deleted through another instance, without navigating", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1", { withSidebar: true });
    await findButton();
    const before = routerCalls();

    await act(async () => {
      await sidebar.current!.remove("sf1");
    });

    await waitFor(() => expect(button()).toBeNull());
    const opened = openMore();
    expect(within(opened).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
    expect(within(opened).queryByText(/Saved: /)).toBeNull();
    expect(routerCalls()).toBe(before);
  });
});

describe("SPEC-CORE-103 I3 a press sends one PATCH of the URL's conditions, with no dialog", () => {
  it("the button PATCHes the page's drive and id with the trimmed q and a null type, and nothing else", async () => {
    renderAt("q=%20%20dogs%20%20&smart_folder_id=sf1");
    fireEvent.click(await findButton());

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].url).toBe("/api/drives/main/smart-folders/sf1");
    expect(patches()[0].body).toEqual({ query: "dogs", file_type: null });
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("the enabled menu row sends the same PATCH, closes …, and opens no dialog", async () => {
    renderAt("q=dogs&type=image&smart_folder_id=sf1");
    await findButton();
    fireEvent.click(await overwriteRow());

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ query: "dogs", file_type: "image" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("disables the button and the row while saving, and a second press in the same tick sends nothing", async () => {
    server.state.holdWrites = true;
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    const shown = await findButton();

    act(() => {
      shown.click();
      shown.click();
    });
    await waitFor(() => expect(server.heldWriteCount()).toBe(1));
    expect(button()).toBeDisabled();
    fireEvent.click(button()!);

    const opened = openMore();
    const row = within(opened).getByRole("menuitem", { name: "Overwrite" });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    closeMore();
    await settle();
    expect(patches()).toHaveLength(1);

    await act(async () => {
      server.releaseWrite(0);
    });
    await waitFor(() => expect(button()).toBeNull());
    expect(patches()).toHaveLength(1);
  });

  it("the disabled row of an unchanged folder sends nothing", async () => {
    renderAt("q=cats&type=video&smart_folder_id=sf1");
    const row = await overwriteRow();
    expect(row).toBeDisabled();
    fireEvent.click(row);
    await settle();
    expect(patches()).toHaveLength(0);
  });
});

describe("SPEC-CORE-103 I4 after a successful overwrite the URL is untouched and the page compares the URL now", () => {
  it("removes the button and disables the row when the URL did not move", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    const before = routerCalls();
    fireEvent.click(await findButton());

    await waitFor(() => expect(button()).toBeNull());
    expect(await overwriteRow()).toBeDisabled();
    expect(routerCalls()).toBe(before);
  });

  it("keeps the button when the URL moved to other conditions during the request", async () => {
    server.state.holdWrites = true;
    const page = renderAt("q=dogs&type=video&smart_folder_id=sf1");
    const before = routerCalls();
    fireEvent.click(await findButton());
    await waitFor(() => expect(server.heldWriteCount()).toBe(1));

    page.navigate("q=birds&type=video&smart_folder_id=sf1");
    await act(async () => {
      server.releaseWrite(0);
    });
    await settle();

    expect(patches()[0].body).toEqual({ query: "dogs", file_type: "video" });
    expect(await findButton()).toBeEnabled();
    expect(routerCalls()).toBe(before);

    page.navigate("q=dogs&type=video&smart_folder_id=sf1");
    await waitFor(() => expect(button()).toBeNull());
  });

  it("stays No folder, with the failure toast, when another instance deletes the folder during the request", async () => {
    server.state.holdWrites = true;
    renderAt("q=dogs&type=video&smart_folder_id=sf1", { withSidebar: true });
    fireEvent.click(await findButton());
    await waitFor(() => expect(server.heldWriteCount()).toBe(1));

    server.state.holdWrites = false;
    await act(async () => {
      await sidebar.current!.remove("sf1");
    });
    await waitFor(() => expect(button()).toBeNull());

    await act(async () => {
      server.releaseWrite(0);
    });
    expect(await screen.findByText("Failed to update Smart Collection")).toBeInTheDocument();
    expect(button()).toBeNull();
    expect(within(openMore()).getByRole("menuitem", { name: en.smartFolder.save })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-103 I5 a failed overwrite shows the toast and leaves the button pressable", () => {
  it("SPEC-CORE-106 I1 shows 「スマートコレクションの更新に失敗しました」 and keeps the button enabled for a retry", async () => {
    server.state.failWrites = true;
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    fireEvent.click(await findButton());

    expect(ja.smartFolder.updateFailed).toBe("スマートコレクションの更新に失敗しました");
    expect(await screen.findByText("Failed to update Smart Collection")).toBeInTheDocument();
    await waitFor(() => expect(button()).toBeEnabled());
    expect(await overwriteRow()).toBeEnabled();
    closeMore();

    server.state.failWrites = false;
    fireEvent.click(button()!);
    await waitFor(() => expect(patches()).toHaveLength(2));
    await waitFor(() => expect(button()).toBeNull());
  });
});

describe("SPEC-CORE-103 I8 the … rows and the button's name", () => {
  it("lists 保存済み, 上書き保存 with the Save icon, 名前変更, 削除 in that order", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    await findButton();
    const row = await overwriteRow();
    const opened = screen.getByRole("menu");

    const saved = within(opened).getByText("Saved: My Folder");
    const rename = within(opened).getByRole("menuitem", { name: en.smartFolder.rename });
    const remove = within(opened).getByRole("menuitem", { name: en.smartFolder.delete });
    expect(precedes(saved, row)).toBe(true);
    expect(precedes(row, rename)).toBe(true);
    expect(precedes(rename, remove)).toBe(true);
    expect(row.querySelector("svg")?.getAttribute("class")).toContain("lucide-save");
    expect(within(opened).queryByRole("menuitem", { name: "Update" })).toBeNull();
  });

  it("names the button after the folder's current name, following a rename made elsewhere", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1", { withSidebar: true });
    await findButton("My Folder");

    await act(async () => {
      await sidebar.current!.update("sf1", { name: "Renamed" });
    });

    expect(await findButton("Renamed")).toBeInTheDocument();
    expect(button("My Folder")).toBeNull();
  });

  it("reads 「「{name}」に上書き保存」 in Japanese", async () => {
    intl.locale = "ja";
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    expect(
      await screen.findByRole("button", { name: "「My Folder」に上書き保存" }),
    ).toBeInTheDocument();
  });

  it("labels the row 「上書き保存」 / Overwrite and drops the update confirmation strings", () => {
    expect(ja.smartFolder.update).toBe("上書き保存");
    expect(en.smartFolder.update).toBe("Overwrite");
    for (const tree of [en.smartFolder, ja.smartFolder] as Array<Record<string, string>>) {
      expect(tree).not.toHaveProperty("updateConfirmTitle");
      expect(tree).not.toHaveProperty("updateConfirmMessage");
    }
  });
});

describe("SPEC-CORE-103 I10 a successful overwrite from the focused button moves focus to …", () => {
  it("focuses the results bar's More actions, not <body>", async () => {
    renderAt("q=dogs&type=video&smart_folder_id=sf1");
    const shown = await findButton();
    shown.focus();
    expect(document.activeElement).toBe(shown);

    fireEvent.click(shown);
    await waitFor(() => expect(button()).toBeNull());

    expect(document.activeElement).toBe(moreButton());
  });
});
