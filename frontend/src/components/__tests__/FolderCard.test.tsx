import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FolderCard } from "../FolderCard";
import type { Folder } from "@/types";

const baseFolderProps = {
  driveName: "test-drive",
};

const folderWithoutThumbnail: Folder = {
  name: "Travel Photos",
  path: "Travel Photos",
  file_count: 42,
  thumbnail_file_id: null,
  dominant_kind: null,
};

const folderWithThumbnail: Folder = {
  name: "Music Collection",
  path: "Music Collection",
  file_count: 15,
  thumbnail_file_id: "thumb123abc",
  dominant_kind: null,
};

describe("FolderCard", () => {
  it("renders folder icon when thumbnail_file_id is null", () => {
    const { container } = render(
      <FolderCard folder={folderWithoutThumbnail} {...baseFolderProps} />
    );
    expect(screen.queryByRole("img")).toBeNull();
    const svgIcon = container.querySelector("svg");
    expect(svgIcon).toBeTruthy();
  });

  it("renders thumbnail image when thumbnail_file_id is set", () => {
    render(
      <FolderCard folder={folderWithThumbnail} {...baseFolderProps} />
    );
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("thumbnail image has correct src URL", () => {
    render(
      <FolderCard folder={folderWithThumbnail} {...baseFolderProps} />
    );
    const img = screen.getByAltText("Music Collection");
    expect(img).toHaveAttribute("src", "/api/files/thumb123abc/thumbnail");
  });

  it("thumbnail image has lazy loading attribute", () => {
    render(
      <FolderCard folder={folderWithThumbnail} {...baseFolderProps} />
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("renders folder name when thumbnail_file_id is null", () => {
    render(
      <FolderCard folder={folderWithoutThumbnail} {...baseFolderProps} />
    );
    expect(screen.getByText("Travel Photos")).toBeInTheDocument();
    expect(screen.getByText("42 items")).toBeInTheDocument();
  });

  it("renders folder name and file count when thumbnail_file_id is set", () => {
    render(
      <FolderCard folder={folderWithThumbnail} {...baseFolderProps} />
    );
    expect(screen.getByText("Music Collection")).toBeInTheDocument();
    expect(screen.getByText("15 items")).toBeInTheDocument();
  });

  it("links to correct folder path", () => {
    render(
      <FolderCard folder={folderWithThumbnail} {...baseFolderProps} />
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
        folder={folderWithThumbnail}
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
        folder={folderWithThumbnail}
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
