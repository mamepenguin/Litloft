/**
 * Inline rename on folder cards — spec
 * 2026-08-21-inline-rename-and-spring-loaded-drag §3.
 *
 * Separate from FolderContent.test.tsx because that file stubs
 * FolderCard, and the point here is the real card.
 */
import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import type { Folder } from "@/types";

import { FolderContent } from "../FolderContent";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: () => <div data-testid="file-grid" />,
}));
vi.mock("@/components/FileList", () => ({
  FileList: () => <div data-testid="file-list" />,
}));

const mockRenameFolder = vi.fn();
vi.mock("@/lib/api", () => ({
  renameFolder: (...args: unknown[]) => mockRenameFolder(...args),
  moveFolder: () => Promise.resolve({}),
  deleteFolder: () => Promise.resolve(undefined),
  createFolder: () => Promise.resolve({}),
  getFolders: () => Promise.resolve([]),
  getFolderTree: () => Promise.resolve([]),
}));

const notes: Folder = {
  name: "Notes",
  path: "Notes",
  file_count: 2,
  thumbnail_file_id: null,
  dominant_kind: null,
};

const props = {
  files: [],
  folders: [notes],
  driveName: "main",
  viewMode: "grid" as const,
  loading: false,
  loadingMore: false,
  isRecent: false,
  hasProfile: true,
  isFavorites: false,
  isRecentAdded: false,
  selectable: false,
  sortQuery: "",
  pinnedPaths: new Set<string>(),
  sentinelRef: createRef<HTMLDivElement>(),
  dragState: {
    isDragging: false,
    dragType: null,
    draggedFileIds: [],
    draggedFileIdSet: new Set<string>(),
    draggedFolderPath: null,
    dropTargetPath: null,
  },
  isDropTarget: () => false,
  getDropTargetProps: () => ({}),
  selectedIds: new Set<string>(),
  onSelect: vi.fn(),
  onMetaSelect: vi.fn(),
  onShiftSelect: vi.fn(),
  onTogglePin: vi.fn(),
  onFavoriteToggle: vi.fn(),
  onRefresh: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  selectedCount: 0,
  isDropDisabled: () => false,
  onFolderDragStart: vi.fn(),
};

function renderContent() {
  return render(
    <ShortcutsProvider>
      <FolderContent {...props} />
    </ShortcutsProvider>,
  );
}

function cardFor(name: string): HTMLElement {
  return screen.getByText(name).closest("div.group") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRenameFolder.mockResolvedValue({});
});

describe("FolderContent inline rename", () => {
  it("edits the card in place instead of opening the rename dialog", async () => {
    renderContent();
    fireEvent.contextMenu(cardFor("Notes"));
    fireEvent.click(await screen.findByText(/^Rename$/i));

    const input = (await screen.findByRole("textbox", {
      name: /new name/i,
    })) as HTMLInputElement;
    expect(input.value).toBe("Notes");
    expect(
      screen.queryByRole("heading", { name: /^Rename$/i }),
    ).not.toBeInTheDocument();
  });

  it("renames through the folder API and refreshes", async () => {
    renderContent();
    fireEvent.contextMenu(cardFor("Notes"));
    fireEvent.click(await screen.findByText(/^Rename$/i));
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.change(input, { target: { value: "Archive" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(mockRenameFolder).toHaveBeenCalledWith("main", "Notes", "Archive");
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
  });

  it("starts editing the focused card on F2", async () => {
    renderContent();
    // Async act: see the note in FolderTreePane.test.tsx — the shortcut
    // context is pushed through an effect cascade that the synchronous
    // form does not reliably drain.
    await act(async () => {
      (screen.getByText("Notes").closest("a") as HTMLElement).focus();
    });

    fireEvent.keyDown(document, { key: "F2" });

    expect(
      await screen.findByRole("textbox", { name: /new name/i }),
    ).toBeInTheDocument();
  });

  it("does nothing on F2 when no card has focus", () => {
    renderContent();
    fireEvent.keyDown(document, { key: "F2" });
    expect(
      screen.queryByRole("textbox", { name: /new name/i }),
    ).not.toBeInTheDocument();
  });

  it("shows why an edit abandoned by a click-away was refused", async () => {
    mockRenameFolder.mockRejectedValue(new Error("API error: 409 Conflict"));
    renderContent();
    fireEvent.contextMenu(cardFor("Notes"));
    fireEvent.click(await screen.findByText(/^Rename$/i));
    const input = await screen.findByRole("textbox", { name: /new name/i });

    fireEvent.change(input, { target: { value: "Taken" } });
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/already taken/i),
    );
    expect(
      screen.queryByRole("textbox", { name: /new name/i }),
    ).not.toBeInTheDocument();
  });
});
