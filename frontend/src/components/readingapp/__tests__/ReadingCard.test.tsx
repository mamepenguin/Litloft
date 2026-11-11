import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ShelfItem } from "@/lib/api";
import { ReadingCard } from "../ReadingCard";

const DRIVE = "main";

function item(extra: Record<string, unknown> = {}): ShelfItem {
  return {
    id: "f1",
    filename: "book.pdf",
    title: "A book",
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra,
  } as ShelfItem;
}

describe("a Reading card", () => {
  it("badges the book's format", () => {
    render(
      <div>
        <ReadingCard
          item={item({ id: "e1", filename: "book.epub", mime_type: "application/epub+zip" })}
          drive={DRIVE}
        />
        <ReadingCard item={item({ id: "p1", filename: "paper.pdf" })} drive={DRIVE} />
        <ReadingCard
          item={item({
            id: "a1",
            filename: "papers.zip",
            mime_type: "application/zip",
            file_type: "archive",
          })}
          drive={DRIVE}
        />
      </div>,
    );

    expect(screen.getByText("EPUB")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("sets the title inside the cover, with no file-type icon, when there is no thumbnail", () => {
    render(<ReadingCard item={item({ title: "Dune" })} drive={DRIVE} />);

    const cover = screen.getByTestId("reading-cover");
    expect(within(cover).getByText("Dune")).toBeInTheDocument();
    expect(cover.querySelector("svg")).toBeNull();
  });

  it("names the folder's last segment, or the drive at the root, and the relative time", () => {
    render(
      <div>
        <ReadingCard item={item({ folder_path: "Books/Novels" })} drive={DRIVE} />
        <ReadingCard item={item({ id: "root", folder_path: "" })} drive={DRIVE} />
      </div>,
    );

    expect(screen.getByText(/Novels · /)).toBeInTheDocument();
    expect(screen.getByText(/main · /)).toBeInTheDocument();
  });

  it("draws a progress bar only when asked", () => {
    const progress = { position: 45, duration: 90 };
    const { rerender } = render(
      <ReadingCard item={item({ watch_progress: progress })} drive={DRIVE} showProgress />,
    );

    expect(screen.getByTestId("progress-fill")).toHaveStyle({ width: "50%" });

    rerender(<ReadingCard item={item({ watch_progress: progress })} drive={DRIVE} />);
    expect(screen.queryByTestId("progress-fill")).not.toBeInTheDocument();
  });
});
