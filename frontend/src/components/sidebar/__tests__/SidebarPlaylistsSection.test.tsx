import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarPlaylistsSection } from "../SidebarPlaylistsSection";
import type { PlaylistSummary } from "@/types";
import { createRef } from "react";

const makePl = (id: string, name: string, count = 3): PlaylistSummary => ({
  id,
  name,
  drive: "main",
  item_count: count,
  created_at: "",
  updated_at: "",
});

const defaultProps = {
  driveBase: "/drive/main",
  playlistList: [makePl("pl1", "Rock"), makePl("pl2", "Jazz", 0)],
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
    expect(screen.getByLabelText("プレイリスト作成")).toBeInTheDocument();
  });

  it("shows create input when creatingPlaylist is true", () => {
    render(<SidebarPlaylistsSection {...defaultProps} creatingPlaylist={true} />);
    expect(screen.getByPlaceholderText("プレイリスト名...")).toBeInTheDocument();
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
    fireEvent.keyDown(screen.getByPlaceholderText("プレイリスト名..."), { key: "Enter" });
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
    fireEvent.keyDown(screen.getByPlaceholderText("プレイリスト名..."), { key: "Escape" });
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
    expect(screen.getByText("リネーム")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("削除"));
    expect(handleDeletePlaylist).toHaveBeenCalledWith("pl1");
  });
});
