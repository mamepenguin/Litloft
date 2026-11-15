import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SmartFolder } from "@/types/smartFolder";
import { SidebarCollectionsSection } from "../sidebar/SidebarCollectionsSection";

// Provide a localStorage mock so collapse-state tests don't crash on jsdom.
function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalLocalStorageDescriptor,
    );
  }
});

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

let mockSmartFolders: SmartFolder[] = [];
const updateMock = vi.fn();
const removeMock = vi.fn();
vi.mock("@/hooks/useSmartFolders", () => ({
  useSmartFolders: () => ({
    smartFolders: mockSmartFolders,
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: vi.fn(),
    update: updateMock,
    remove: removeMock,
  }),
}));

vi.mock("../SmartFolderSaveDialog", () => ({
  SmartFolderSaveDialog: ({
    open,
    initialName,
    onSubmit,
  }: {
    open: boolean;
    initialName?: string;
    onSubmit: (name: string) => void;
  }) =>
    open ? (
      <div data-testid="rename-dialog" data-initial={initialName}>
        <button data-testid="rename-submit" onClick={() => onSubmit("Renamed")}>
          submit
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button data-testid="confirm-ok" onClick={onConfirm}>
          ok
        </button>
      </div>
    ) : null,
}));

const SF1: SmartFolder = {
  id: "sf1",
  drive: "main",
  name: "Recent videos",
  query: "video",
  file_type: "video",
  sort_by: null,
  sort_order: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: null,
};

const SF2: SmartFolder = {
  ...SF1,
  id: "sf2",
  name: "Photos",
  query: "image",
  file_type: "image",
};

const props = (close: () => void = vi.fn()) => ({
  currentDrive: "main",
  driveBase: "/drive/main",
  close,
  collectionList: [],
  setCollectionList: vi.fn(),
  creatingCollection: false,
  setCreatingCollection: vi.fn(),
  newCollectionName: "",
  setNewCollectionName: vi.fn(),
  renamingId: null as string | null,
  setRenamingId: vi.fn(),
  renameValue: "",
  setRenameValue: vi.fn(),
  contextMenu: null as { id: string; x: number; y: number } | null,
  setContextMenu: vi.fn(),
  createInputRef: createRef<HTMLInputElement>(),
  renameInputRef: createRef<HTMLInputElement>(),
  handleCreateCollection: vi.fn(),
  handleRenameCollection: vi.fn(),
  handleDeleteCollection: vi.fn(),
  handleCollectionClick: vi.fn(),
});

describe("SPEC-CORE-107 I3 the Smart Collection rows of the Collections section", () => {
  beforeEach(() => {
    routerPush.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
    mockStorage.clear();
    mockSmartFolders = [];
  });

  it("SPEC-CORE-107 I3 shows the Collections heading and no rows when the drive has nothing", () => {
    render(<SidebarCollectionsSection {...props()} />);
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(screen.queryByText("Recent videos")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-107 I3 renders the drive's Smart Collections under Collections", () => {
    mockSmartFolders = [SF1, SF2];
    render(<SidebarCollectionsSection {...props()} />);
    expect(screen.getByText("Recent videos")).toBeInTheDocument();
    expect(screen.getByText("Photos")).toBeInTheDocument();
    expect(screen.getByText("Collections")).toBeInTheDocument();
  });

  it("navigates to /drive/{drive}/search?... on click", () => {
    mockSmartFolders = [SF1];
    const close = vi.fn();
    render(<SidebarCollectionsSection {...props(close)} />);
    fireEvent.click(screen.getByText("Recent videos"));
    expect(routerPush).toHaveBeenCalledWith(
      "/drive/main/search?q=video&type=video&smart_folder_id=sf1",
    );
    expect(close).toHaveBeenCalled();
  });

  it("omits type param when the Smart Collection has no file_type", () => {
    mockSmartFolders = [{ ...SF1, file_type: null }];
    render(<SidebarCollectionsSection {...props()} />);
    fireEvent.click(screen.getByText("Recent videos"));
    expect(routerPush).toHaveBeenCalledWith(
      "/drive/main/search?q=video&smart_folder_id=sf1",
    );
  });

  it("opens the Smart Collection's context menu on right-click", () => {
    mockSmartFolders = [SF1];
    render(<SidebarCollectionsSection {...props()} />);
    fireEvent.contextMenu(screen.getByText("Recent videos"));
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renames a Smart Collection via the rename dialog", async () => {
    mockSmartFolders = [SF1];
    updateMock.mockResolvedValueOnce({ ...SF1, name: "Renamed" });
    render(<SidebarCollectionsSection {...props()} />);
    fireEvent.contextMenu(screen.getByText("Recent videos"));
    fireEvent.click(screen.getByText("Rename"));
    // ContextMenu wraps onClick in requestAnimationFrame, so wait for the
    // dialog to mount before submitting.
    const dialog = await screen.findByTestId("rename-dialog");
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rename-submit"));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("sf1", { name: "Renamed" });
    });
  });

  it("deletes a Smart Collection via the confirm dialog", async () => {
    mockSmartFolders = [SF1];
    removeMock.mockResolvedValueOnce(undefined);
    render(<SidebarCollectionsSection {...props()} />);
    fireEvent.contextMenu(screen.getByText("Recent videos"));
    fireEvent.click(screen.getByText("Delete"));
    const ok = await screen.findByTestId("confirm-ok");
    fireEvent.click(ok);
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith("sf1");
    });
  });

  it("collapses both kinds from the Collections heading", () => {
    mockSmartFolders = [SF1, SF2];
    render(<SidebarCollectionsSection {...props()} />);
    const toggle = screen.getByRole("button", { name: "Collapse" });
    fireEvent.click(toggle);
    expect(screen.queryByText("Recent videos")).not.toBeInTheDocument();
    expect(screen.queryByText("Photos")).not.toBeInTheDocument();
  });
});
