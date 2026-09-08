/**
 * The kind rule as the seven surfaces actually render it.
 *
 * `primaryMeta` is unit-tested next to itself. What this file checks is
 * that every surface which leads with a fact about a file asks it and
 * obeys the answer — the failure that matters is a rule that is correct
 * and unwired, which looks identical to no rule at all. That was the
 * state of the tree before this suite existed: `lib/primaryMeta.ts` had
 * written the table down and only `FileCard` read it, so a list row and
 * a detail page went on saying "83 B" about a 19-minute video.
 *
 * `FileListRow` and the trash / missing rows each draw their meta twice
 * — once for `sm:` and up, once for below it — and jsdom holds both, so
 * every assertion here is made per branch. A single `getAllByText`
 * would have passed with one of the two branches still unfixed.
 *
 * The seven surfaces split on one thing only: whether they have a
 * thumbnail badge to put a length on. `FileCard`, `FileListRow` and the
 * two list forms do; `FileMetaBlock` and the two card forms do not, and
 * draw the length on the meta line themselves. Both halves are checked
 * here, because reading "video shows no size" off a surface that also
 * shows no length is how a card loses its length altogether.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
}));

// The action row pulls the addon slots, Cast and the delete flow in
// behind it. None of that is what this file is about.
vi.mock("@/components/FileDetail/FileActionRow", () => ({
  FileActionRow: () => null,
}));

import { formatRelativeDate } from "@/lib/format";
import { FileList } from "../FileList";
import { FileMetaBlock } from "../FileDetail/FileMetaBlock";
import { TrashFileList } from "../trash/TrashFileList";
import { TrashFileGrid } from "../trash/TrashFileGrid";
import { MissingFileList } from "../missing/MissingFileList";
import { MissingFileGrid } from "../missing/MissingFileGrid";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id: "file1",
  filename: "clip.mp4",
  title: "Test File",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  // 83 B, D-3's number: a `.loft` reference file reports the pointer's
  // size, not the media's.
  file_size: 83,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

const VIDEO = { file_type: "video" as const, filename: "clip.mp4.loft" };
const IMAGE = {
  file_type: "image" as const,
  filename: "shot.jpg",
  mime_type: "image/jpeg",
};
const DOC = {
  file_type: "document" as const,
  filename: "notes.md",
  mime_type: "text/markdown",
};

/**
 * The two halves of a row's meta, told apart by the class that decides
 * which viewport sees them. Declared as the markup each state should
 * have rather than gathered by text: a query that only asks "is `83 B`
 * anywhere" cannot tell a fixed desktop branch from a fixed pair.
 */
const desktopMeta = (container: HTMLElement) =>
  [...container.querySelectorAll("span.sm\\:inline")]
    .map((el) => el.textContent!.trim())
    .filter(Boolean);

const mobileMeta = (container: HTMLElement) =>
  [...container.querySelectorAll("span.sm\\:hidden")]
    .map((el) => el.textContent!.trim())
    .filter(Boolean);

/** The row's own duration badge, which is where video says its length. */
const badges = () => screen.queryAllByText(/^\d+:\d{2}$/);

describe("FileListRow — the first fact, in both of its branches", () => {
  it("leaves the size off a video in both branches, and keeps the badge", () => {
    const { container } = render(
      <FileList files={[makeFile({ ...VIDEO, duration: 1438 })]} />,
    );
    expect(desktopMeta(container)).not.toContain("83 B");
    expect(mobileMeta(container)).not.toContain("83 B");
    // The length is not lost — it moved to where the card puts it too.
    expect(badges()).toHaveLength(1);
    expect(screen.getByText("23:58")).toBeInTheDocument();
  });

  it("says nothing at all for a video whose length was never probed", () => {
    // 56 of the 60 rows of the measured `.loft` folder. Neither the
    // badge nor a size: the date is what the row is left with.
    const { container } = render(<FileList files={[makeFile(VIDEO)]} />);
    expect(desktopMeta(container)).not.toContain("83 B");
    expect(mobileMeta(container)).not.toContain("83 B");
    expect(badges()).toHaveLength(0);
  });

  it("leads an image with its dimensions in both branches, never its size", () => {
    const { container } = render(
      <FileList
        files={[
          makeFile({
            ...IMAGE,
            image_width: 1920,
            image_height: 1080,
            file_size: 2295580,
          }),
        ]}
      />,
    );
    expect(desktopMeta(container)).toContain("1920 × 1080");
    expect(mobileMeta(container)).toContain("1920 × 1080");
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("gives an unprobed image neither dimensions nor a size", () => {
    const { container } = render(
      <FileList files={[makeFile({ ...IMAGE, file_size: 2295580 })]} />,
    );
    expect(desktopMeta(container)).not.toContain("2.2 MB");
    expect(mobileMeta(container)).not.toContain("2.2 MB");
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("keeps the size on the kinds it was always right for, in both branches", () => {
    const { container } = render(
      <FileList files={[makeFile({ ...DOC, file_size: 25437, duration: null })]} />,
    );
    expect(desktopMeta(container)).toContain("24.8 KB");
    expect(mobileMeta(container)).toContain("24.8 KB");
  });

  it("takes the mobile separator away with the fact it separated", () => {
    // The narrow branch reads `size · date`. Dropping the size without
    // its dot leaves a row that opens on a bullet.
    const { container: doc } = render(
      <FileList files={[makeFile({ ...DOC, file_size: 25437 })]} />,
    );
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(mobileMeta(doc)).toEqual(["24.8 KB", "·", date]);

    const { container: video } = render(
      <FileList files={[makeFile({ ...VIDEO, duration: 1438 })]} />,
    );
    expect(mobileMeta(video)).toEqual([date]);
  });
});

/** Everything `FileMetaBlock` needs that this file is not about. */
const metaBlockProps = {
  editing: false,
  editTitle: "",
  editDesc: "",
  saving: false,
  onEditTitleChange: () => {},
  onEditDescChange: () => {},
  onSave: () => {},
  onCancelEdit: () => {},
  onStartEdit: () => {},
  onFileChange: () => {},
  onRefetch: () => {},
  mediaController: null,
  videoRef: { current: null },
  addonSlotProps: {},
  tagChips: null,
};

/**
 * The block's meta line, named by the markup it has when it exists.
 * `nextElementSibling` off the title would not do: with the line gone
 * the next element is the tag row, and an empty one reads as a line
 * that is present and blank.
 */
const metaLine = (container: HTMLElement) => {
  const el = container.querySelector("div.mt-1.text-xs.text-text-muted");
  return el ? el.textContent!.trim() : null;
};

describe("FileMetaBlock — the same rule, on a surface with no badge", () => {
  const renderBlock = (file: FileItem) =>
    render(
      <FileMetaBlock
        {...metaBlockProps}
        file={file}
        isTimedMedia={file.file_type === "video" || file.file_type === "audio"}
      />,
    );

  it("drops the size from a video and keeps its length", () => {
    // The line D-3 reported as `23:58 · 83 B`.
    const { container } = renderBlock(makeFile({ ...VIDEO, duration: 1438 }));
    expect(metaLine(container)).toBe("23:58");
  });

  it("keeps a real video's length and drops its real size too", () => {
    // The rule is about the kind, not about whether this particular
    // row's size happens to be a lie — two videos side by side must not
    // describe themselves differently.
    const { container } = renderBlock(
      makeFile({ ...VIDEO, filename: "real.mp4", duration: 1145, file_size: 686594558 }),
    );
    expect(metaLine(container)).toBe("19:05");
    expect(screen.queryByText(/654\.8 MB/)).toBeNull();
  });

  it("draws no line at all where the kind and the length are both silent", () => {
    // This is the case that produced the bug report: with the size gone
    // there is nothing left, and an always-drawn line would be a gap
    // between the title and the description standing in for a fact
    // nobody has.
    const { container } = renderBlock(makeFile(VIDEO));
    expect(metaLine(container)).toBeNull();
  });

  it("gives an image its dimensions, which no other part of this page says", () => {
    const { container } = renderBlock(
      makeFile({ ...IMAGE, image_width: 4000, image_height: 3000, file_size: 2295580 }),
    );
    expect(metaLine(container)).toBe("4000 × 3000");
  });

  it("draws no line for an image whose dimensions were never probed", () => {
    const { container } = renderBlock(makeFile({ ...IMAGE, file_size: 2295580 }));
    expect(metaLine(container)).toBeNull();
  });

  it("keeps the size for a document", () => {
    const { container } = renderBlock(makeFile({ ...DOC, file_size: 25437 }));
    expect(metaLine(container)).toBe("24.8 KB");
  });
});


/**
 * The meta line of a card that has no badge: every span of it, in order.
 * The separator is included deliberately — dropping a fact without the
 * dot that separated it is a distinct failure from dropping neither.
 */
const cardMeta = (container: HTMLElement) =>
  [...container.querySelectorAll("div.mt-1.text-xs.text-text-muted span")]
    .map((el) => el.textContent!.trim())
    .filter(Boolean);

const TRASHED = { deleted_at: "2026-01-01T00:00:00" };
const GONE = { missing_since: "2026-01-01T00:00:00" };
const noop = () => {};

describe("Trash and missing rows — badge present, so the rule applies as it does on a folder row", () => {
  const trashRow = (file: FileItem) =>
    render(<TrashFileList files={[file]} onRestore={noop} onPurge={noop} />);
  const missingRow = (file: FileItem) =>
    render(<MissingFileList files={[file]} onPurge={noop} />);

  it("drops a trashed video's size from both branches and keeps its badge", () => {
    const { container } = trashRow(makeFile({ ...VIDEO, ...TRASHED, duration: 1438 }));
    expect(desktopMeta(container)).not.toContain("83 B");
    expect(mobileMeta(container)).not.toContain("83 B");
    expect(screen.getByText("23:58")).toBeInTheDocument();
  });

  it("drops a missing video's size from both branches and keeps its badge", () => {
    const { container } = missingRow(makeFile({ ...VIDEO, ...GONE, duration: 1438 }));
    expect(desktopMeta(container)).not.toContain("83 B");
    expect(mobileMeta(container)).not.toContain("83 B");
    expect(screen.getByText("23:58")).toBeInTheDocument();
  });

  it("gives a trashed image its dimensions in both branches", () => {
    const { container } = trashRow(
      makeFile({ ...IMAGE, ...TRASHED, image_width: 1920, image_height: 1080, file_size: 2295580 }),
    );
    expect(desktopMeta(container)).toContain("1920 × 1080");
    expect(mobileMeta(container)).toContain("1920 × 1080");
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("gives a missing image its dimensions in both branches", () => {
    const { container } = missingRow(
      makeFile({ ...IMAGE, ...GONE, image_width: 1920, image_height: 1080, file_size: 2295580 }),
    );
    expect(desktopMeta(container)).toContain("1920 × 1080");
    expect(mobileMeta(container)).toContain("1920 × 1080");
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("keeps a document's size in both branches, on both surfaces", () => {
    // The size is what the trash is asked for — how much purging this
    // gets back — and for a document it is also the true figure.
    const { container: trash } = trashRow(makeFile({ ...DOC, ...TRASHED, file_size: 25437 }));
    expect(desktopMeta(trash)).toContain("24.8 KB");
    expect(mobileMeta(trash)).toContain("24.8 KB");

    const { container: missing } = missingRow(makeFile({ ...DOC, ...GONE, file_size: 25437 }));
    expect(desktopMeta(missing)).toContain("24.8 KB");
    expect(mobileMeta(missing)).toContain("24.8 KB");
  });
});

describe("Trash and missing cards — no badge, so the length goes on the line", () => {
  const trashCard = (file: FileItem) =>
    render(<TrashFileGrid files={[file]} onRestore={noop} onPurge={noop} />);
  const missingCard = (file: FileItem) =>
    render(<MissingFileGrid files={[file]} onPurge={noop} />);

  it("draws a trashed video's length itself, since no badge does", () => {
    // This is where copying the row's answer would have gone wrong: the
    // card has no badge — the corner `FileCard` puts the length in is
    // this surface's deadline — so "no first metadatum" would leave the
    // length nowhere on the card at all.
    const { container } = trashCard(makeFile({ ...VIDEO, ...TRASHED, duration: 1438 }));
    expect(cardMeta(container)).toContain("23:58");
    expect(cardMeta(container)).not.toContain("83 B");
  });

  it("draws a missing video's length itself too", () => {
    const { container } = missingCard(makeFile({ ...VIDEO, ...GONE, duration: 1438 }));
    expect(cardMeta(container)).toContain("23:58");
    expect(cardMeta(container)).not.toContain("83 B");
  });

  it("leaves a trash card with its date alone when the length is unknown, and no orphaned dot", () => {
    const { container } = trashCard(makeFile({ ...VIDEO, ...TRASHED }));
    expect(cardMeta(container)).toEqual([formatRelativeDate("2026-01-01T00:00:00")]);
  });

  it("leaves a missing card with its date alone when the length is unknown", () => {
    const { container } = missingCard(makeFile({ ...VIDEO, ...GONE }));
    expect(cardMeta(container)).toEqual([formatRelativeDate("2026-01-01T00:00:00")]);
  });

  it("gives the cards an image's dimensions rather than its size", () => {
    const image = { ...IMAGE, image_width: 1920, image_height: 1080, file_size: 2295580 };
    const { container: trash } = trashCard(makeFile({ ...image, ...TRASHED }));
    expect(cardMeta(trash)).toContain("1920 × 1080");
    expect(cardMeta(trash)).not.toContain("2.2 MB");

    const { container: missing } = missingCard(makeFile({ ...image, ...GONE }));
    expect(cardMeta(missing)).toContain("1920 × 1080");
    expect(cardMeta(missing)).not.toContain("2.2 MB");
  });

  it("keeps a document's size on both cards", () => {
    const { container: trash } = trashCard(makeFile({ ...DOC, ...TRASHED, file_size: 25437 }));
    expect(cardMeta(trash)).toContain("24.8 KB");

    const { container: missing } = missingCard(makeFile({ ...DOC, ...GONE, file_size: 25437 }));
    expect(cardMeta(missing)).toContain("24.8 KB");
  });
});
