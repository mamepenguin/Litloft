import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarPlaylistsSection } from "../SidebarPlaylistsSection";
import type { PlaylistSummary } from "@/types";
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

const makePl = (id: string, name: string, count = 3): PlaylistSummary => ({
  id,
  name,
  drive: "main",
  item_count: count,
  first_file_id: null,
  created_at: "",
  updated_at: "",
});

const defaultProps = {
  currentDrive: "main",
  driveBase: "/drive/main",
  playlistList: [makePl("pl1", "Rock"), makePl("pl2", "Jazz", 0)],
  setPlaylistList: vi.fn(),
  creatingPlaylist: false,
  setCreatingPlaylist: vi.fn(),
  newPlaylistName: "",
  setNewPlaylistName: vi.fn(),
  renamingId: null as string | null,
  setRenamingId: vi.fn(),
  renameValue: "",
  setRenameValue: vi.fn(),
  contextMenu: null as { id: string; x: number; y: number } | null,
  setContextMenu: vi.fn(),
  createInputRef: createRef<HTMLInputElement>(),
  renameInputRef: createRef<HTMLInputElement>(),
  handleCreatePlaylist: vi.fn(),
  handleRenamePlaylist: vi.fn(),
  handleDeletePlaylist: vi.fn(),
  handlePlaylistClick: vi.fn(),
};

describe("SidebarPlaylistsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
  });

  it("renders playlist items", () => {
    render(<SidebarPlaylistsSection {...defaultProps} />);
    expect(screen.getByText("Rock")).toBeInTheDocument();
    expect(screen.getByText("Jazz")).toBeInTheDocument();
  });

  it("shows item count", () => {
    render(<SidebarPlaylistsSection {...defaultProps} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders create button", () => {
    render(<SidebarPlaylistsSection {...defaultProps} />);
    expect(screen.getByLabelText("Create playlist")).toBeInTheDocument();
  });

  it("shows create input when creatingPlaylist is true", () => {
    render(<SidebarPlaylistsSection {...defaultProps} creatingPlaylist={true} />);
    expect(screen.getByPlaceholderText("Playlist name...")).toBeInTheDocument();
  });

  it("calls handleCreatePlaylist on Enter", () => {
    const handleCreatePlaylist = vi.fn();
    render(
      <SidebarPlaylistsSection
        {...defaultProps}
        creatingPlaylist={true}
        handleCreatePlaylist={handleCreatePlaylist}
      />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Playlist name..."), { key: "Enter" });
    expect(handleCreatePlaylist).toHaveBeenCalled();
  });

  it("cancels creation on Escape", () => {
    const setCreatingPlaylist = vi.fn();
    render(
      <SidebarPlaylistsSection
        {...defaultProps}
        creatingPlaylist={true}
        setCreatingPlaylist={setCreatingPlaylist}
      />
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Playlist name..."), { key: "Escape" });
    expect(setCreatingPlaylist).toHaveBeenCalledWith(false);
  });

  it("calls handlePlaylistClick on playlist click", () => {
    const handlePlaylistClick = vi.fn();
    render(
      <SidebarPlaylistsSection {...defaultProps} handlePlaylistClick={handlePlaylistClick} />
    );
    fireEvent.click(screen.getByText("Rock"));
    expect(handlePlaylistClick).toHaveBeenCalledWith(defaultProps.playlistList[0]);
  });

  it("shows rename input when renamingId matches", () => {
    render(<SidebarPlaylistsSection {...defaultProps} renamingId="pl1" renameValue="Rock Edit" />);
    const input = screen.getByDisplayValue("Rock Edit");
    expect(input).toBeInTheDocument();
  });

  it("shows context menu when set", () => {
    render(
      <SidebarPlaylistsSection
        {...defaultProps}
        contextMenu={{ id: "pl1", x: 100, y: 200 }}
      />
    );
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls handleDeletePlaylist from context menu", () => {
    const handleDeletePlaylist = vi.fn();
    render(
      <SidebarPlaylistsSection
        {...defaultProps}
        contextMenu={{ id: "pl1", x: 100, y: 200 }}
        handleDeletePlaylist={handleDeletePlaylist}
      />
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(handleDeletePlaylist).toHaveBeenCalledWith("pl1");
  });

  it("hides playlist items when collapsed and persists state", () => {
    render(<SidebarPlaylistsSection {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: "Collapse" });
    fireEvent.click(toggle);
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    expect(screen.queryByText("Jazz")).not.toBeInTheDocument();
    expect(mockStorage.getItem("sidebar:section:playlists:collapsed")).toBe("1");
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it("starts collapsed when localStorage flag is set", () => {
    mockStorage.setItem("sidebar:section:playlists:collapsed", "1");
    render(<SidebarPlaylistsSection {...defaultProps} />);
    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it("create button auto-expands collapsed section", () => {
    mockStorage.setItem("sidebar:section:playlists:collapsed", "1");
    const setCreatingPlaylist = vi.fn();
    render(
      <SidebarPlaylistsSection
        {...defaultProps}
        setCreatingPlaylist={setCreatingPlaylist}
      />
    );
    fireEvent.click(screen.getByLabelText("Create playlist"));
    expect(setCreatingPlaylist).toHaveBeenCalledWith(true);
    expect(mockStorage.getItem("sidebar:section:playlists:collapsed")).toBeNull();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });
});
