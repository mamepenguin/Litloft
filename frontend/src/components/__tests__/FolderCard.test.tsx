import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FolderCard } from "../FolderCard";
import type { Folder } from "@/types";

const baseFolderProps = {
  driveName: "test-drive",
};

const emptyFolder: Folder = {
  name: "Travel Photos",
  path: "Travel Photos",
  file_count: 0,
  kind_counts: {},
  dominant_kind: null,
};

const mixedFolder: Folder = {
  name: "Music Collection",
  path: "Music Collection",
  file_count: 138,
  kind_counts: { video: 135, document: 3 },
  dominant_kind: "video",
};

describe("FolderCard", () => {
  it("draws a glyph, and never a photograph", () => {
    // The card used to borrow a picture from the first video or image
    // anywhere beneath the folder, so a row of folders mixed photos and
    // line art in one column. Asserted on the mixed folder, which is
    // exactly the case that used to produce a photo.
    const { container } = render(
      <FolderCard folder={mixedFolder} {...baseFolderProps} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("says what the count is made of", () => {
    render(<FolderCard folder={mixedFolder} {...baseFolderProps} />);
    expect(
      screen.getByText("138 items · Video 135 · Document 3"),
    ).toBeInTheDocument();
  });

  it("names a single kind without repeating its count", () => {
    render(
      <FolderCard
        folder={{ ...mixedFolder, file_count: 12, kind_counts: { document: 12 } }}
        {...baseFolderProps}
      />,
    );
    expect(screen.getByText("12 items · Document")).toBeInTheDocument();
    // The number is already to its left; saying it twice is the shape
    // `lib/listMeta.ts` calls a column with one distinct value.
    expect(screen.queryByText(/Document 12/)).toBeNull();
  });

  it("names the two largest kinds and stops", () => {
    render(
      <FolderCard
        folder={{
          ...mixedFolder,
          file_count: 20,
          kind_counts: { video: 10, document: 6, image: 3, audio: 1 },
        }}
        {...baseFolderProps}
      />,
    );
    expect(screen.getByText("20 items · Video 10 · Document 6")).toBeInTheDocument();
    expect(screen.queryByText(/Image/)).toBeNull();
    expect(screen.queryByText(/Audio/)).toBeNull();
  });

  it("gives the breakdown the card's full width, not the strip beside the glyph", () => {
    // Measured, not guessed: beside a 48px glyph inside a 160px card at
    // 375px the meta had 68px, which cut "3 items · Document" mid-word —
    // less than the bare count it replaced. Its own row gives it 128px
    // there. jsdom lays nothing out, so what is pinned is the structure
    // that produces the width: the meta is a sibling of the row holding
    // the glyph, not a child of it.
    const { container } = render(
      <FolderCard folder={mixedFolder} {...baseFolderProps} />,
    );
    const meta = screen.getByText("138 items · Video 135 · Document 3");
    const glyph = container.querySelector("svg")!;
    // The meta's own parent spans the card: it holds the glyph too, one
    // row up. In the layout this replaced, the meta lived inside the
    // narrow text column beside the glyph, whose box holds no glyph.
    expect(meta.parentElement!.contains(glyph)).toBe(true);
    // And it is not inside the glyph's row, which is the strip.
    const glyphRow = glyph.parentElement!.parentElement!;
    expect(glyphRow.contains(meta)).toBe(false);
  });

  it("says only the count for a folder with nothing in it", () => {
    render(<FolderCard folder={emptyFolder} {...baseFolderProps} />);
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("puts no heading on the title", () => {
    // A grid of thirty cards used to emit thirty `<h3>`s at the same
    // depth as the six section names above them (D-5). The name is still
    // the link's accessible name, which is what a reader navigates by.
    const { container } = render(
      <FolderCard folder={mixedFolder} {...baseFolderProps} />,
    );
    expect(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: /Music Collection/ }),
    ).toBeInTheDocument();
  });

  it("renders the folder name", () => {
    render(<FolderCard folder={emptyFolder} {...baseFolderProps} />);
    expect(screen.getByText("Travel Photos")).toBeInTheDocument();
  });

  it("links to correct folder path", () => {
    render(
      <FolderCard folder={mixedFolder} {...baseFolderProps} />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/drive/test-drive/Music%20Collection"
    );
  });

  it("calls onContextMenu when right-clicked", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <FolderCard
        folder={mixedFolder}
        {...baseFolderProps}
        onContextMenu={onContextMenu}
      />
    );
    const card = container.firstChild as HTMLElement;
    fireEvent.contextMenu(card);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("does not render legacy hover action buttons", () => {
    render(
      <FolderCard
        folder={mixedFolder}
        {...baseFolderProps}
        onContextMenu={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Pin")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unpin")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rename")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Move")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
});

describe("FolderCard inline rename", () => {
  const editingProps = {
    ...baseFolderProps,
    folder: emptyFolder,
    isEditing: true,
    onRenameCommit: vi.fn().mockResolvedValue(undefined),
    onRenameCancel: vi.fn(),
  };

  it("replaces the name with an editable field", () => {
    render(<FolderCard {...editingProps} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Travel Photos");
  });

  it("does not wrap the field in the folder link", () => {
    // A text field inside an <a> navigates away on click.
    render(<FolderCard {...editingProps} />);
    expect(screen.getByRole("textbox").closest("a")).toBeNull();
  });

  it("turns off the card's drag source while editing", () => {
    const { container } = render(
      <FolderCard {...editingProps} draggable onDragStart={vi.fn()} />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.getAttribute("draggable")).not.toBe("true");
    expect(card.className).not.toMatch(/\bselect-none\b/);
  });

  it("stays draggable when not editing", () => {
    const { container } = render(
      <FolderCard
        {...editingProps}
        isEditing={false}
        draggable
        onDragStart={vi.fn()}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.getAttribute("draggable")).toBe("true");
    expect(card.className).toMatch(/\bselect-none\b/);
  });

  it("reports focus so the host can bind F2", () => {
    const onCardFocus = vi.fn();
    const { container } = render(
      <FolderCard
        {...baseFolderProps}
        folder={emptyFolder}
        onCardFocus={onCardFocus}
      />,
    );
    fireEvent.focus(container.querySelector("a")!);
    expect(onCardFocus).toHaveBeenCalled();
  });
});
