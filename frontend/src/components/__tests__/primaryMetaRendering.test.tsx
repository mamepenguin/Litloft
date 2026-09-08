/**
 * The kind rule as every surface actually renders it.
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
 * The surfaces split on one thing only: whether they say the length
 * somewhere else already. `FileCard`, `FileListRow`, `TrashFileList` and
 * `MissingFileList` badge it, `AudioPlayer` has a transport bar;
 * `FileMetaBlock`, the two card forms and the duplicates row do not, and
 * draw it on the meta line themselves. `JustifiedFileCell` badges it and
 * draws no meta line at all.
 *
 * **Every one of them is rendered in this file, and both halves of each
 * are asserted.** Reading "video shows no size" off a surface that also
 * shows no length is how a card loses its length altogether, and the one
 * surface an earlier version of this suite did not mount — `FileCard` —
 * was the one where a mutation could do exactly that and stay green.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0, duration: 0 }),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
  getDrives: vi.fn().mockResolvedValue([{ name: "media", protected: false, file_count: 2 }]),
  getDuplicates: vi.fn(),
  batchDelete: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "A", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

// The action row pulls the addon slots, Cast and the delete flow in
// behind it. None of that is what this file is about.
vi.mock("@/components/FileDetail/FileActionRow", () => ({
  FileActionRow: () => null,
}));

import { formatRelativeDate } from "@/lib/format";
import { getDuplicates } from "@/lib/api";
import { FileCard } from "../FileCard";
import { FileList } from "../FileList";
import { AudioPlayer } from "../AudioPlayer";
import { JustifiedFileCell } from "../JustifiedFileCell";
import { DuplicatesSection } from "../DuplicatesSection";
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
    // Declared per branch, not merely "83 B is absent": a desktop span
    // emitted twice, or an empty one left behind, is invisible to a
    // `not.toContain` and is what a missing guard actually produces.
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(desktopMeta(container)).toEqual([date]);
    expect(mobileMeta(container)).toEqual([date]);
    // The length is not lost — it moved to where the card puts it too.
    expect(badges()).toHaveLength(1);
    expect(screen.getByText("23:58")).toBeInTheDocument();
  });

  it("says nothing at all for a video whose length was never probed", () => {
    // 56 of the 60 rows of the measured `.loft` folder. Neither the
    // badge nor a size: the date is what the row is left with.
    const { container } = render(<FileList files={[makeFile(VIDEO)]} />);
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(desktopMeta(container)).toEqual([date]);
    expect(mobileMeta(container)).toEqual([date]);
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
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(desktopMeta(container)).toEqual(["1920 × 1080", date]);
    expect(mobileMeta(container)).toEqual(["1920 × 1080", "·", date]);
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("gives an unprobed image neither dimensions nor a size", () => {
    const { container } = render(
      <FileList files={[makeFile({ ...IMAGE, file_size: 2295580 })]} />,
    );
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(desktopMeta(container)).toEqual([date]);
    expect(mobileMeta(container)).toEqual([date]);
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("keeps the size on the kinds it was always right for, in both branches", () => {
    const { container } = render(
      <FileList files={[makeFile({ ...DOC, file_size: 25437, duration: null })]} />,
    );
    const date = formatRelativeDate("2026-01-01T00:00:00");
    expect(desktopMeta(container)).toEqual(["24.8 KB", date]);
    expect(mobileMeta(container)).toEqual(["24.8 KB", "·", date]);
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
 *
 * Keyed to the title it follows and to the two tokens that say what the
 * line *is*, and deliberately **not** to `mt-1`: a detector that turns
 * red when someone changes a margin is reporting a defect that is not
 * there, and the next person learns to ignore it.
 */
const metaLine = (container: HTMLElement) => {
  const el = container.querySelector("h1 ~ div.text-xs.text-text-muted");
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
 * The meta line of a card, every span of it, in order.
 *
 * The separator is included deliberately — dropping a fact without the
 * dot that separated it is a distinct failure from dropping neither.
 * Empty spans are included too: an earlier version of this helper ended
 * in `.filter(Boolean)`, which threw away exactly the artefact a missing
 * `length > 0` guard produces, so the mutation that removed one survived.
 * Not keyed to `mt-1`, for the reason above `metaLine`.
 */
const cardMetaEl = (container: HTMLElement) =>
  container.querySelector("div.text-xs.text-text-muted");

const cardMeta = (container: HTMLElement) =>
  [...(cardMetaEl(container)?.querySelectorAll("span") ?? [])].map((el) =>
    el.textContent!.trim(),
  );

/** Whether the card drew a meta line element at all. */
const hasCardMetaLine = (container: HTMLElement) => cardMetaEl(container) !== null;

/** The one place a badge-drawing surface says a length. */
const durationBadge = (container: HTMLElement) =>
  [...container.querySelectorAll("span.absolute")]
    .map((el) => el.textContent!.trim())
    .filter((t) => /^\d+:\d{2}(:\d{2})?$/.test(t));

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
    expect(desktopMeta(container)).toEqual([]);
    expect(mobileMeta(container)).toEqual([]);
    expect(durationBadge(container)).toEqual(["23:58"]);
  });

  it("drops a missing video's size from both branches and keeps its badge", () => {
    const { container } = missingRow(makeFile({ ...VIDEO, ...GONE, duration: 1438 }));
    expect(desktopMeta(container)).toEqual([]);
    expect(mobileMeta(container)).toEqual([]);
    expect(durationBadge(container)).toEqual(["23:58"]);
  });

  it("gives a trashed image its dimensions in both branches", () => {
    const { container } = trashRow(
      makeFile({ ...IMAGE, ...TRASHED, image_width: 1920, image_height: 1080, file_size: 2295580 }),
    );
    expect(desktopMeta(container)).toEqual(["1920 × 1080"]);
    expect(mobileMeta(container)).toEqual(["1920 × 1080"]);
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("gives a missing image its dimensions in both branches", () => {
    const { container } = missingRow(
      makeFile({ ...IMAGE, ...GONE, image_width: 1920, image_height: 1080, file_size: 2295580 }),
    );
    expect(desktopMeta(container)).toEqual(["1920 × 1080"]);
    expect(mobileMeta(container)).toEqual(["1920 × 1080"]);
    expect(screen.queryByText("2.2 MB")).toBeNull();
  });

  it("keeps a document's size in both branches, on both surfaces", () => {
    // The size is what the trash is asked for — how much purging this
    // gets back — and for a document it is also the true figure.
    const { container: trash } = trashRow(makeFile({ ...DOC, ...TRASHED, file_size: 25437 }));
    expect(desktopMeta(trash)).toEqual(["24.8 KB"]);
    expect(mobileMeta(trash)).toEqual(["24.8 KB"]);

    const { container: missing } = missingRow(makeFile({ ...DOC, ...GONE, file_size: 25437 }));
    expect(desktopMeta(missing)).toEqual(["24.8 KB"]);
    expect(mobileMeta(missing)).toEqual(["24.8 KB"]);
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
    expect(cardMeta(container)).toEqual([
      "23:58",
      "·",
      formatRelativeDate("2026-01-01T00:00:00"),
    ]);
  });

  it("draws a missing video's length itself too", () => {
    const { container } = missingCard(makeFile({ ...VIDEO, ...GONE, duration: 1438 }));
    expect(cardMeta(container)).toEqual([
      "23:58",
      "·",
      formatRelativeDate("2026-01-01T00:00:00"),
    ]);
  });

  it("leaves a trash card with its date alone when the length is unknown, and no orphaned dot", () => {
    const { container } = trashCard(makeFile({ ...VIDEO, ...TRASHED }));
    expect(cardMeta(container)).toEqual([formatRelativeDate("2026-01-01T00:00:00")]);
  });

  it("leaves a missing card with its date alone when the length is unknown", () => {
    const { container } = missingCard(makeFile({ ...VIDEO, ...GONE }));
    expect(cardMeta(container)).toEqual([formatRelativeDate("2026-01-01T00:00:00")]);
  });

  it("draws no meta line on a missing card that has neither half", () => {
    // Both of this card's halves are optional — unlike the trash card,
    // whose date is unconditional — so it is the one form that can
    // reach "nothing to say" and render an empty row anyway. The API
    // cannot produce a null `missing_since` in this view today, but the
    // component guards the field, so the state is one it claims to
    // handle.
    const { container } = missingCard(makeFile(VIDEO));
    expect(hasCardMetaLine(container)).toBe(false);
  });

  it("gives the cards an image's dimensions rather than its size", () => {
    const image = { ...IMAGE, image_width: 1920, image_height: 1080, file_size: 2295580 };
    const date = formatRelativeDate("2026-01-01T00:00:00");
    const { container: trash } = trashCard(makeFile({ ...image, ...TRASHED }));
    expect(cardMeta(trash)).toEqual(["1920 × 1080", "·", date]);

    const { container: missing } = missingCard(makeFile({ ...image, ...GONE }));
    expect(cardMeta(missing)).toEqual(["1920 × 1080", "·", date]);
  });

  it("keeps a document's size on both cards", () => {
    const date = formatRelativeDate("2026-01-01T00:00:00");
    const { container: trash } = trashCard(makeFile({ ...DOC, ...TRASHED, file_size: 25437 }));
    expect(cardMeta(trash)).toEqual(["24.8 KB", "·", date]);

    const { container: missing } = missingCard(makeFile({ ...DOC, ...GONE, file_size: 25437 }));
    expect(cardMeta(missing)).toEqual(["24.8 KB", "·", date]);
  });
});


const AUDIO = {
  file_type: "audio" as const,
  filename: "track.m4a.loft",
  mime_type: "audio/mp4",
};

describe("FileCard — the badge and the line, on the surface the rule started from", () => {
  const card = (file: FileItem) => render(<FileCard file={file} />);
  const date = () => formatRelativeDate("2026-01-01T00:00:00");

  it("badges a video's length and leads its line with the date", () => {
    const { container } = card(makeFile({ ...VIDEO, duration: 1438 }));
    expect(durationBadge(container)).toEqual(["23:58"]);
    expect(cardMeta(container)).toEqual([date()]);
  });

  it("badges an AUDIO file that has no thumbnail of its own", () => {
    // The one case the suite could not see before, and the one where
    // the two halves can disagree without either looking wrong.
    // `hasThumbnail` is `has_thumbnail || video || image`, so it is
    // false for exactly this file — and `primaryMetaText` is already
    // null for audio. A badge condition that also required a thumbnail
    // would leave this card carrying its title and its date and nothing
    // else: no length anywhere, which is the failure `hasKnownLength`
    // was extracted to make impossible. Measured 2026-09: all 53 audio
    // files in the library have no stored thumbnail, so this is the
    // ordinary case for the kind, not a corner.
    const { container } = card(
      makeFile({ ...AUDIO, duration: 1438, has_thumbnail: false }),
    );
    expect(durationBadge(container)).toEqual(["23:58"]);
    expect(cardMeta(container)).toEqual([date()]);
  });

  it("draws no badge and no size for an audio file whose length is unknown", () => {
    const { container } = card(makeFile({ ...AUDIO, has_thumbnail: false }));
    expect(durationBadge(container)).toEqual([]);
    expect(cardMeta(container)).toEqual([date()]);
  });

  it("leads an image with its dimensions and a document with its size", () => {
    const { container: image } = card(
      makeFile({ ...IMAGE, image_width: 1920, image_height: 1080, file_size: 2295580 }),
    );
    expect(cardMeta(image)).toEqual(["1920 × 1080", "·", date()]);

    const { container: doc } = card(makeFile({ ...DOC, file_size: 25437 }));
    expect(cardMeta(doc)).toEqual(["24.8 KB", "·", date()]);
  });
});

describe("JustifiedFileCell — a badge and no line at all", () => {
  it("badges an audio cell, which is the half of the predicate nothing else pins", () => {
    // This cell draws no meta row — unequal widths, so a caption would
    // not line up into a column — so it correctly never asks the table.
    // What it does share is the badge condition, and until it read
    // `hasKnownLength` it spelled the predicate out for itself.
    const { container } = render(
      <JustifiedFileCell file={makeFile({ ...AUDIO, duration: 1438 })} />,
    );
    expect(durationBadge(container)).toEqual(["23:58"]);
    expect(hasCardMetaLine(container)).toBe(false);
  });

  it("badges a video cell and draws nothing for a document", () => {
    const { container: video } = render(
      <JustifiedFileCell file={makeFile({ ...VIDEO, duration: 1438 })} />,
    );
    expect(durationBadge(video)).toEqual(["23:58"]);

    const { container: doc } = render(
      <JustifiedFileCell file={makeFile({ ...DOC, file_size: 25437 })} />,
    );
    expect(durationBadge(doc)).toEqual([]);
    expect(doc.textContent).not.toContain("24.8 KB");
  });
});

describe("AudioPlayer — the viewer column of the same file page", () => {
  it("puts no size under the filename", () => {
    // The defect this PR is about, on the page it names, for one of the
    // two kinds the table singles out: the inspector said "23:58" while
    // the viewer said "83 B" directly under the filename. The length is
    // on the transport bar of the <audio> below.
    const { container } = render(
      <AudioPlayer file={makeFile({ ...AUDIO, duration: 1438, file_size: 83 })} />,
    );
    expect(screen.getByText("track.m4a.loft")).toBeInTheDocument();
    expect(container.textContent).not.toContain("83 B");
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("puts no size there for a real audio file either", () => {
    // The kind decides, not whether this row's size happens to be a lie.
    const { container } = render(
      <AudioPlayer file={makeFile({ ...AUDIO, filename: "real.m4a", file_size: 5000000 })} />,
    );
    expect(container.textContent).not.toContain("4.8 MB");
  });
});

describe("DuplicatesSection — a file row with a name and a fact under it", () => {
  const group = (files: FileItem[]) => ({
    groups: [{ hash: "h", files, wasted_bytes: files[0].file_size }],
    total_groups: 1,
    total_wasted_bytes: files[0].file_size,
  });

  // The panel scans nothing until a drive is picked, and the rows sit
  // behind their group's disclosure. Both are user steps, so the test
  // takes them rather than reaching past them.
  const openGroup = async (files: FileItem[]) => {
    vi.mocked(getDuplicates).mockResolvedValue(group(files) as never);
    const view = render(<DuplicatesSection />);
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "media" },
    });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(files[0].filename.slice(0, 6)) }));
    return view;
  };

  it("gives a duplicated .loft video its length, not the pointer's 83 B", async () => {
    // Measured on this library: real duplicate groups hold `.loft`
    // video pairs whose rows both read "83 B" for a 5:34 video. No
    // badge on the 40px thumbnail, so the length goes on the line.
    const { container } = await openGroup([
      makeFile({ ...VIDEO, id: "a", duration: 1438, file_size: 83 }),
      makeFile({ ...VIDEO, id: "b", duration: 1438, file_size: 83 }),
    ]);
    const rows = [...container.querySelectorAll("label")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.textContent).toContain("23:58");
      expect(row.textContent).not.toContain("83 B");
    }
  });

  it("keeps a duplicated document's size", async () => {
    const { container } = await openGroup([
      makeFile({ ...DOC, id: "a", file_size: 25437 }),
      makeFile({ ...DOC, id: "b", file_size: 25437 }),
    ]);
    for (const row of container.querySelectorAll("label")) {
      expect(row.textContent).toContain("24.8 KB");
    }
  });
});
