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

  it("disables the card when isClickable=false", () => {
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

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
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
});
