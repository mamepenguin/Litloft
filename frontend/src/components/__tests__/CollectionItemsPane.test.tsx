import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CollectionItemsPane } from "../CollectionItemsPane";
import type { CollectionItemEntry, FileItem } from "@/types";

const selectFile = vi.fn();
const useSelectedFileMock = vi.fn(() => ({
  fileId: null as string | null,
  selectFile,
  clearFile: vi.fn(),
}));

vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => useSelectedFileMock(),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

function makeFile(id: string): FileItem {
  return {
    id,
    filename: `${id}.md`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
  };
}

const items: CollectionItemEntry[] = [
  { id: 1, position: 0, file: makeFile("a") },
  { id: 2, position: 1, file: makeFile("b") },
  { id: 3, position: 2, file: makeFile("c") },
];

const handlers = {
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onRemove: vi.fn(),
};

beforeEach(() => {
  selectFile.mockClear();
  Object.values(handlers).forEach((fn) => fn.mockClear());
  useSelectedFileMock.mockReturnValue({
    fileId: null,
    selectFile,
    clearFile: vi.fn(),
  });
});

describe("CollectionItemsPane", () => {
  it("renders an empty placeholder when items is empty", () => {
    render(<CollectionItemsPane items={[]} {...handlers} />);
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders one row per item with the title", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    expect(screen.getByText("File a")).toBeInTheDocument();
    expect(screen.getByText("File b")).toBeInTheDocument();
    expect(screen.getByText("File c")).toBeInTheDocument();
  });

  it("calls selectFile when a row is clicked", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    fireEvent.click(screen.getByText("File b"));
    expect(selectFile).toHaveBeenCalledWith("b");
  });

  it("highlights the row matching ?file=", () => {
    useSelectedFileMock.mockReturnValueOnce({
      fileId: "b",
      selectFile,
      clearFile: vi.fn(),
    });
    render(<CollectionItemsPane items={items} {...handlers} />);
    const rows = Array.from(document.querySelectorAll("li"));
    const target = rows.find((li) => li.textContent?.includes("File b"));
    expect(target?.className).toContain("ring-accent");
  });

  it("invokes onMoveUp with the row index", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    const moveUp = screen
      .getAllByLabelText("Move up")
      .find((b) => !(b as HTMLButtonElement).disabled);
    if (!moveUp) throw new Error("expected an enabled move-up button");
    fireEvent.click(moveUp);
    expect(handlers.onMoveUp).toHaveBeenCalledWith(1);
  });

  it("invokes onMoveDown with the row index", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    const moveDown = screen
      .getAllByLabelText("Move down")
      .find((b) => !(b as HTMLButtonElement).disabled);
    if (!moveDown) throw new Error("expected an enabled move-down button");
    fireEvent.click(moveDown);
    expect(handlers.onMoveDown).toHaveBeenCalledWith(0);
  });

  it("invokes onRemove with the item id (not index)", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    const removeButtons = screen.getAllByLabelText("Remove from collection");
    fireEvent.click(removeButtons[2]);
    expect(handlers.onRemove).toHaveBeenCalledWith(3);
  });

  it("disables the first row's move-up and the last row's move-down", () => {
    render(<CollectionItemsPane items={items} {...handlers} />);
    const moveUps = screen.getAllByLabelText("Move up") as HTMLButtonElement[];
    expect(moveUps[0].disabled).toBe(true);
    const moveDowns = screen.getAllByLabelText(
      "Move down",
    ) as HTMLButtonElement[];
    expect(moveDowns[moveDowns.length - 1].disabled).toBe(true);
  });
});
