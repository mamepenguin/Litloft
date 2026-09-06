import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ArchiveEntryCard } from "../ArchiveEntryCard";
import type { ArchiveEntry } from "@/types";

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

vi.mock("../../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

function makeEntry(
  path: string,
  overrides: Partial<ArchiveEntry> = {}
): ArchiveEntry {
  const is_dir = path.endsWith("/");
  const filename = is_dir
    ? path.slice(0, -1).split("/").pop()!
    : path.split("/").pop()!;
  return {
    path,
    filename,
    file_size: 1024,
    compressed_size: 512,
    file_type: "other",
    mime_type: "",
    is_dir,
    ...overrides,
  };
}

// Track the most-recent observer instance so we can fire visibility manually.
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  static instances: MockIntersectionObserver[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

describe("ArchiveEntryCard", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a card container for image entries", () => {
    const entry = makeEntry("photo.jpg", { file_type: "image" });
    const { container } = render(
      <ArchiveEntryCard
        entry={entry}
        fileId="file-1"
        onClick={vi.fn()}
        isClickable={true}
      />
    );

    // Filename should be visible somewhere on the card
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    // Top-level element exists
    expect(container.firstChild).not.toBeNull();
  });

  it("renders FileTypeIcon for non-image, non-directory entries", () => {
    const entry = makeEntry("doc.txt", { file_type: "document" });
    render(
      <ArchiveEntryCard
        entry={entry}
        fileId="file-1"
        onClick={vi.fn()}
        isClickable={true}
      />
    );

    expect(screen.getByTestId("icon-document")).toBeInTheDocument();
    expect(screen.getByText("doc.txt")).toBeInTheDocument();
  });

  it("renders a folder visual when entry is a directory", () => {
    const entry = makeEntry("photos/");
    const { container } = render(
      <ArchiveEntryCard
        entry={entry}
        fileId="file-1"
        onClick={vi.fn()}
        isClickable={true}
      />
    );

    // Folder name shown
    expect(screen.getByText("photos")).toBeInTheDocument();
    // Folder icon (lucide-react Folder renders as an svg with the class
    // "lucide-folder"). We check for some svg presence at minimum.
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    // FileTypeIcon should NOT be used for directories
    expect(screen.queryByTestId("icon-other")).not.toBeInTheDocument();
    expect(screen.queryByTestId("icon-document")).not.toBeInTheDocument();
  });

  // D-14. A grid cell had no way out at all: the listing's row carried a
  // download and the cell carried nothing, so a level defaulting to grid left
  // an unopenable entry with nowhere to go.
  it("gives a dead-end cell a download, and stops being a control", () => {
    const entry = makeEntry("locked.bin", { file_type: "other" });
    const onClick = vi.fn();
    render(
      <ArchiveEntryCard
        entry={entry}
        fileId="file-1"
        onClick={onClick}
        isClickable={false}
      />
    );

    expect(screen.queryByRole("button")).toBeNull();
    const link = screen.getByRole("link", { name: "Download locked.bin" });
    expect(link.getAttribute("download")).toBe("locked.bin");
    expect(document.querySelectorAll(".opacity-60").length).toBe(0);
    // A 44px target on a touch screen. `p-2` on a 16px glyph is 32, which is
    // over the 24x24 floor a repeated disclosure control needs and under the
    // one DESIGN.md sets for a finger.
    expect(link.className).toContain("pointer-coarse:h-11");
    expect(link.className).toContain("pointer-coarse:w-11");
    // And a name, not a name plus a tooltip saying the same thing.
    expect(link.hasAttribute("title")).toBe(false);
    // The reason, in the listing's words. A corner icon says there is a
    // download, not why it is all there is.
    expect(screen.getByText(/No preview/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("locked.bin"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not put a download on a cell that opens", () => {
    render(
      <ArchiveEntryCard
        entry={makeEntry("photo.jpg", { file_type: "image" })}
        fileId="file-1"
        onClick={vi.fn()}
        isClickable
      />
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button")).toBeInTheDocument();
    // And no reason label, for the same rule the listing's rows follow.
    expect(screen.queryByText(/No preview/)).toBeNull();
  });

  it("calls onClick when the card is clicked and clickable", () => {
    const entry = makeEntry("photo.jpg", { file_type: "image" });
    const onClick = vi.fn();
    render(
      <ArchiveEntryCard
        entry={entry}
        fileId="file-1"
        onClick={onClick}
        isClickable={true}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("omits an image's filename when told the level does not need it", () => {
    render(
      <ArchiveEntryCard
        entry={makeEntry("p01_007.jpg", { file_type: "image", mime_type: "image/jpeg" })}
        fileId="a1"
        onClick={vi.fn()}
        isClickable
        showFilename={false}
      />,
    );
    expect(screen.queryByText("p01_007.jpg")).toBeNull();
  });

  it("still names a non-image entry, which has no picture to go by", () => {
    render(
      <ArchiveEntryCard
        entry={makeEntry("credits.txt", { file_type: "document", mime_type: "text/plain" })}
        fileId="a1"
        onClick={vi.fn()}
        isClickable
        showFilename={false}
      />,
    );
    expect(screen.getByText("credits.txt")).toBeInTheDocument();
  });

  it("still names a folder", () => {
    render(
      <ArchiveEntryCard
        entry={makeEntry("chapter-2/")}
        fileId="a1"
        onClick={vi.fn()}
        isClickable
        showFilename={false}
      />,
    );
    expect(screen.getByText("chapter-2")).toBeInTheDocument();
  });
});
