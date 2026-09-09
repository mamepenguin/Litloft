import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarCollectionsSection } from "../SidebarCollectionsSection";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { dismissByPressingOutside } from "@/__tests__/helpers/dismissScrim";
import type { CollectionSummary } from "@/types";
import { createRef } from "react";

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

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

const makeCol = (id: string, name: string, count = 3): CollectionSummary => ({
  id,
  name,
  description: null,
  drive: "main",
  item_count: count,
  first_file_id: null,
  created_at: "",
  updated_at: "",
});

const defaultProps = {
  currentDrive: "main",
  driveBase: "/drive/main",
  collectionList: [makeCol("c1", "Rock"), makeCol("c2", "Jazz", 0)],
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
};

describe("SidebarCollectionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
  });

  it("renders collection items", () => {
    render(<SidebarCollectionsSection {...defaultProps} />);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("Jazz")).toBeInTheDocument();
  });

  it("shows item count", () => {
    render(<SidebarCollectionsSection {...defaultProps} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders create button", () => {
    render(<SidebarCollectionsSection {...defaultProps} />);
    expect(screen.getByLabelText("Create collection")).toBeInTheDocument();
  });

  it("shows create input when creatingCollection is true", () => {
    render(<SidebarCollectionsSection {...defaultProps} creatingCollection={true} />);
    expect(screen.getByPlaceholderText("Collection name...")).toBeInTheDocument();
  });

  it("calls handleCreateCollection on Enter", () => {
    const handleCreateCollection = vi.fn();
    render(
      <SidebarCollectionsSection
        {...defaultProps}
        creatingCollection={true}
        handleCreateCollection={handleCreateCollection}
      />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Collection name..."), { key: "Enter" });
    expect(handleCreateCollection).toHaveBeenCalled();
  });

  it("cancels creation on Escape", () => {
    const setCreatingCollection = vi.fn();
    render(
      <SidebarCollectionsSection
        {...defaultProps}
        creatingCollection={true}
        setCreatingCollection={setCreatingCollection}
      />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Collection name..."), { key: "Escape" });
    expect(setCreatingCollection).toHaveBeenCalledWith(false);
  });

  it("calls handleCollectionClick on collection click", () => {
    const handleCollectionClick = vi.fn();
    render(
      <SidebarCollectionsSection {...defaultProps} handleCollectionClick={handleCollectionClick} />
    );
    fireEvent.click(screen.getByText("Rock"));
    expect(handleCollectionClick).toHaveBeenCalledWith(defaultProps.collectionList[0]);
  });

  it("shows rename input when renamingId matches", () => {
    render(<SidebarCollectionsSection {...defaultProps} renamingId="c1" renameValue="Rock Edit" />);
    const input = screen.getByDisplayValue("Rock Edit");
    expect(input).toBeInTheDocument();
  });

  it("shows context menu when set", () => {
    render(
      <ShortcutsProvider>
        <SidebarCollectionsSection
          {...defaultProps}
          contextMenu={{ id: "c1", x: 100, y: 200 }}
        />
      </ShortcutsProvider>,
    );
    // Rows, not bare buttons: this section drew its own panel with no
    // `role` at all, which is why the popup sweep could not see it.
    expect(screen.getByRole("menuitem", { name: /Rename/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
  });

  it("calls handleDeleteCollection from context menu", async () => {
    const handleDeleteCollection = vi.fn();
    render(
      <ShortcutsProvider>
        <SidebarCollectionsSection
          {...defaultProps}
          contextMenu={{ id: "c1", x: 100, y: 200 }}
          handleDeleteCollection={handleDeleteCollection}
        />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    // `ContextMenu` closes first and runs the entry on the next frame, so
    // the dialog an entry opens is not mounted inside a menu that is
    // going away.
    await waitFor(() =>
      expect(handleDeleteCollection).toHaveBeenCalledWith("c1"),
    );
  });

  it("dismisses through the scrim, without pressing the row underneath", () => {
    // The defect this section had: a `window` click listener closed the
    // menu and the same click reached the collection row, navigating to
    // it. Its sibling `SidebarSmartFoldersSection` already used the
    // shared `ContextMenu`, so one sidebar had two behaviours.
    //
    // jsdom hit-tests nothing, so what is asserted is that the scrim
    // exists and that it — not a `window` listener — is what closes the
    // menu. `e2e-layout/popup-dismiss.spec.ts` measures the hit test.
    const setContextMenu = vi.fn();
    const handleCollectionClick = vi.fn();
    render(
      <ShortcutsProvider>
        <SidebarCollectionsSection
          {...defaultProps}
          contextMenu={{ id: "c1", x: 100, y: 200 }}
          setContextMenu={setContextMenu}
          handleCollectionClick={handleCollectionClick}
        />
      </ShortcutsProvider>,
    );

    fireEvent.click(screen.getByText("Rock"));
    expect(handleCollectionClick).toHaveBeenCalledTimes(1);
    setContextMenu.mockClear();
    handleCollectionClick.mockClear();

    dismissByPressingOutside();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(handleCollectionClick).not.toHaveBeenCalled();
  });

  it("hides collection items when collapsed and persists state", () => {
    render(<SidebarCollectionsSection {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: "Collapse" });
    fireEvent.click(toggle);
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    expect(screen.queryByText("Jazz")).not.toBeInTheDocument();
    expect(mockStorage.getItem("sidebar:section:collections:collapsed")).toBe("1");
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it("starts collapsed when localStorage flag is set", () => {
    mockStorage.setItem("sidebar:section:collections:collapsed", "1");
    render(<SidebarCollectionsSection {...defaultProps} />);
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it("migrates legacy 'sidebar:section:playlists:collapsed' to the new key", () => {
    mockStorage.setItem("sidebar:section:playlists:collapsed", "1");
    render(<SidebarCollectionsSection {...defaultProps} />);
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    expect(mockStorage.getItem("sidebar:section:collections:collapsed")).toBe("1");
    expect(mockStorage.getItem("sidebar:section:playlists:collapsed")).toBeNull();
  });

  it("create button auto-expands collapsed section", () => {
    mockStorage.setItem("sidebar:section:collections:collapsed", "1");
    const setCreatingCollection = vi.fn();
    render(
      <SidebarCollectionsSection
        {...defaultProps}
        setCreatingCollection={setCreatingCollection}
      />
    );
    fireEvent.click(screen.getByLabelText("Create collection"));
    expect(setCreatingCollection).toHaveBeenCalledWith(true);
    expect(mockStorage.getItem("sidebar:section:collections:collapsed")).toBeNull();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });
});
