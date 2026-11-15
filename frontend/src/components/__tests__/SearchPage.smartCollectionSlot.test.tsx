/**
 * SPEC-ADDON-110 step 1, I6 (core half): the `smart-collection-actions` slot in the
 * search page's … menu.
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
const registered = vi.hoisted(() => ({ ids: new Set<string>(["search-modes", "smart-collection-actions"]) }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: (id: string) => registered.ids.has(id) }),
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
  slotCalls.calls = [];
  registered.ids = new Set(["search-modes", "smart-collection-actions"]);
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


const SLOT = "smart-collection-actions";
const moreButton = () => screen.getByRole("button", { name: /^More actions$/ });

function openMenu() {
  fireEvent.click(moreButton());
  return screen.getByRole("menu");
}

/**
 * The menu read in document order as tokens: the saved block's label, its rows,
 * separators, the two slots, and Selection mode.
 */
function tokens(menu: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of menu.querySelectorAll<HTMLElement>("*")) {
    const testId = el.getAttribute("data-testid");
    if (el.getAttribute("role") === "separator" || el.tagName === "HR") out.push("sep");
    else if (testId === `slot-${SLOT}`) out.push("slot");
    else if (testId === "slot-search-modes") out.push("modes");
    else if (el.getAttribute("role") === "menuitem") {
      out.push(el.textContent?.includes("Selection mode") ? "select" : "item");
    } else if (el.children.length === 0 && /^Saved: /.test(el.textContent ?? "")) out.push("saved");
  }
  return out;
}

function lastSlotProps() {
  const calls = slotCalls.calls.filter((c) => c.id === SLOT);
  return calls[calls.length - 1]?.props;
}

async function menuWithSavedBlock() {
  const menu = openMenu();
  await within(menu).findByText(/^Saved: /);
  return menu;
}

describe("SPEC-ADDON-110 step 1 / I6 the slot in the Files view", () => {
  it("draws the slot with the Smart Collection's drive, id and name, and a closeMenu", async () => {
    renderAt("q=cats&type=video&smart_folder_id=sf1");
    const menu = await menuWithSavedBlock();

    expect(within(menu).getByTestId(`slot-${SLOT}`)).toBeInTheDocument();
    const props = lastSlotProps()!;
    expect(props).toMatchObject({ drive: "main", smartCollectionId: "sf1", smartCollectionName: "My Folder" });
    expect(Object.keys(props).sort()).toEqual(["closeMenu", "drive", "smartCollectionId", "smartCollectionName"]);

    act(() => (props.closeMenu as () => void)());
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("places the slot right after the saved block's separator and before Selection mode, adding no separator", async () => {
    renderAt("q=cats&type=video&smart_folder_id=sf1");
    const seq = tokens(await menuWithSavedBlock());

    const saved = seq.indexOf("saved");
    const slot = seq.indexOf("slot");
    expect(saved).toBeGreaterThanOrEqual(0);
    expect(slot).toBeGreaterThan(saved);
    expect(seq.slice(saved + 1, slot - 1).every((t) => t === "item")).toBe(true);
    expect(seq[slot - 1]).toBe("sep");
    expect(seq[slot + 1]).toBe("select");
  });

  it.each([
    ["an edited query", "q=dogs&type=video&smart_folder_id=sf1"],
    ["an edited type", "q=cats&type=image&smart_folder_id=sf1"],
    ["a plain search", "q=cats&type=video"],
  ])("leaves the slot out on %s", async (_label, query) => {
    const page = renderAt("q=cats&type=video&smart_folder_id=sf1");
    expect(within(await menuWithSavedBlock()).getByTestId(`slot-${SLOT}`)).toBeInTheDocument();
    fireEvent.click(moreButton());

    page.navigate(query);
    await waitFor(() => {
      fireEvent.click(moreButton());
      const menu = screen.getByRole("menu");
      const present = within(menu).queryByTestId(`slot-${SLOT}`);
      fireEvent.click(moreButton());
      expect(present).toBeNull();
    });
  });

  it("names the slot after the Smart Collection's current name", async () => {
    renderAt("q=cats&type=video&smart_folder_id=sf1", { withSidebar: true });
    await menuWithSavedBlock();
    fireEvent.click(moreButton());

    await act(async () => {
      await sidebar.current!.update("sf1", { name: "Renamed" });
    });
    openMenu();

    await waitFor(() => expect(lastSlotProps()).toMatchObject({ smartCollectionName: "Renamed" }));
  });
});

describe("SPEC-ADDON-110 step 1 / I6 the slot in the Passages view", () => {
  beforeEach(() => {
    listing.passagesApplicable = true;
  });

  it("with a registered entry: the saved block, a separator, the slot, then the Find entries", async () => {
    renderAt("q=cats&type=video&show=passages&smart_folder_id=sf1");
    const seq = tokens(await menuWithSavedBlock());

    const saved = seq.indexOf("saved");
    const slot = seq.indexOf("slot");
    expect(slot).toBeGreaterThan(saved);
    expect(seq.slice(saved + 1, slot - 1).every((t) => t === "item")).toBe(true);
    expect(seq[slot - 1]).toBe("sep");
    expect(seq[slot + 1]).toBe("modes");
    expect(lastSlotProps()).toMatchObject({ drive: "main", smartCollectionId: "sf1", smartCollectionName: "My Folder" });
  });

  it("with no registered entry no separator is added, and registering one adds the separator and the slot", async () => {
    registered.ids = new Set(["search-modes"]);
    const page = renderAt("q=cats&type=video&show=passages&smart_folder_id=sf1");
    const without = tokens(await menuWithSavedBlock()).filter((t) => t !== "slot");
    fireEvent.click(moreButton());

    const saved = without.indexOf("saved");
    const modes = without.indexOf("modes");
    expect(modes).toBeGreaterThan(saved);
    expect(without.slice(saved + 1, modes)).not.toContain("sep");

    registered.ids = new Set(["search-modes", SLOT]);
    page.navigate("q=cats&type=video&show=passages&smart_folder_id=sf1");
    const withEntry = tokens(openMenu());
    const slot = withEntry.indexOf("slot");
    expect(slot).toBeGreaterThan(withEntry.indexOf("saved"));
    expect(withEntry[slot - 1]).toBe("sep");
  });

  it("leaves the slot out of the Passages menu on an edited query", async () => {
    const page = renderAt("q=cats&type=video&show=passages&smart_folder_id=sf1");
    const withSlot = tokens(await menuWithSavedBlock());
    fireEvent.click(moreButton());
    expect(withSlot).toContain("slot");

    page.navigate("q=dogs&type=video&show=passages&smart_folder_id=sf1");
    await waitFor(() => {
      fireEvent.click(moreButton());
      const seq = tokens(screen.getByRole("menu"));
      fireEvent.click(moreButton());
      expect(seq).not.toContain("slot");
    });
  });
});
