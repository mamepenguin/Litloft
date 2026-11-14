/**
 * SPEC-CORE-069 I10: the `?view=continue` screen's empty states, through the
 * real listing hook, content and empty state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";

const api = vi.hoisted(() => ({
  getDriveFiles: vi.fn(),
  getFolders: vi.fn(),
  getWatchHistory: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => api.getDriveFiles(...args),
  getFolders: (...args: unknown[]) => api.getFolders(...args),
  getWatchHistory: (...args: unknown[]) => api.getWatchHistory(...args),
}));

let nickname: string | null = "alice";
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  getRecentFileIds: () => [],
}));

vi.mock("@/hooks/useIsInternalDragging", () => ({
  useIsInternalDragging: () => false,
}));

vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));

vi.mock("@/components/Breadcrumb", () => ({
  Breadcrumb: (props: Record<string, unknown>) => (
    <nav
      aria-label="Breadcrumb"
      data-drive={String(props.driveName ?? "")}
      data-folder={String(props.folderPath ?? "")}
      data-drive-is-ancestor={props.driveIsAncestor ? "yes" : "no"}
      data-drop-props={props.getDropTargetProps ? "yes" : "no"}
      data-drop-target={props.isDropTarget ? "yes" : "no"}
    >
      trail
    </nav>
  ),
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: ({ drive }: { drive: string }) => (
    <button data-testid="tree-toggle" data-drive={drive}>
      tree
    </button>
  ),
}));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({
  SmartFolderController: ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <>
      <div data-controller-props={JSON.stringify(props)} />
      {children}
    </>
  ),
  SmartFolderMenuItems: () => null,
  SmartFolderOverwriteButton: () => null,
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id, layout, props }: { id: string; layout?: string; props?: Record<string, unknown> }) => (
    <div
      data-testid={`slot-${id}`}
      data-layout={String(layout ?? "")}
      // The names separately from the values: `JSON.stringify` drops every
      // function, so a callback prop is invisible in the serialized object
      // and a test enumerating its keys would not see one arrive.
      data-slot-prop-keys={Object.keys(props ?? {}).sort().join(",")}
      data-slot-props={JSON.stringify({
        ...props,
        // A function does not survive JSON; record only whether one arrived.
        onSelect: props?.onSelect ? "fn" : "none",
        closeMenu: props?.closeMenu ? "fn" : "none",
      })}
    />
  ),
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({
  SortButton: ({ onChange }: { onChange: (s: string, o: string) => void }) => (
    <button data-testid="sort-button" onClick={() => onChange("file_size", "asc")}>
      Sort
    </button>
  ),
}));
vi.mock("@/components/AddButton", () => ({
  // Stands in for the one control that puts things in a folder. It renders a
  // row per prop it is given, so a test can still see *which* of them
  // FolderBrowser decided to offer — the real menu keeps them behind a click.
  AddButton: ({ onCreateFolder }: { onCreateFolder?: () => void }) => (
    <>
      {/* Named by their text, as the real rows are: `ActionMenuItem` puts
          the label in the button's content and carries no `aria-label`, so
          a stand-in with one would let an assertion pass against a naming
          path the product does not use. */}
      <button>Add</button>
      {onCreateFolder && (
        // Called with no arguments, as `ActionMenuItem` calls it. Passing
        // the click event instead hands the handler an event where it
        // expects a name.
        <button onClick={() => onCreateFolder()}>New Folder</button>
      )}
    </>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));


const NOTHING_IN_PROGRESS = "Nothing in progress";
const DESK_DESCRIPTION = "Files you opened in the last two weeks and stopped part-way appear here.";

beforeEach(() => {
  vi.clearAllMocks();
  nickname = "alice";
  api.getDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 30 } });
  api.getFolders.mockResolvedValue([]);
  api.getWatchHistory.mockResolvedValue([]);
});

describe("SPEC-CORE-069 I10 the continue view's empty states", () => {
  it("SPEC-CORE-069 says Nothing in progress when the desk is empty", async () => {
    render(<FolderBrowser driveName="main" view="continue" />);

    expect(await screen.findByText(NOTHING_IN_PROGRESS)).toBeInTheDocument();
    expect(screen.getByText(DESK_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText("No recently viewed files")).toBeNull();
  });

  it("SPEC-CORE-069 says Nothing in progress when the request fails", async () => {
    api.getWatchHistory.mockRejectedValue(new Error("network"));
    render(<FolderBrowser driveName="main" view="continue" />);

    expect(await screen.findByText(NOTHING_IN_PROGRESS)).toBeInTheDocument();
  });

  it("SPEC-CORE-069 shows the Recently Viewed no-profile state without a profile", async () => {
    nickname = null;
    render(<FolderBrowser driveName="main" view="continue" />);

    expect(await screen.findByText("No profile set")).toBeInTheDocument();
    expect(screen.queryByText(NOTHING_IN_PROGRESS)).toBeNull();
    expect(api.getDriveFiles).not.toHaveBeenCalled();
  });
});
