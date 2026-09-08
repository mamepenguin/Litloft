/**
 * Every kind that is not the document form on `FileDetailShell`.
 *
 * It began as §7 of the 2026-09 redesign — PDF, archives and images —
 * and the rest of the kinds arrived by removing the list rather than by
 * lengthening it. What the list produced was never a decision about the
 * kinds outside it: an `.xlsx` had no inspector and no way to open one,
 * and neither did `text/plain`, which was the largest group left behind
 * and has a perfectly good viewer. The shell is the skeleton for opening
 * a file, so on the canonical surface every kind rides it and the rows
 * below say so one kind at a time.
 *
 * The measurement that produced it: a 190-page comic at 1512×807 gave
 * its viewer 100px and the metadata under it 440px. The viewer's height
 * came from its own contents, so the deeper the archive the less of it
 * was on screen, and every section below it moved when you went down a
 * level. Nothing here is about the viewers themselves — that is Phase 4.
 * It is about the column they are in.
 *
 * The shell is left real, as in `MediaShell.test.tsx`. Stubbing it is
 * what let a second page row ship once already.
 *
 * **What these rows cannot see**, named so a green tick is not read as
 * covering it: anything decided by layout. jsdom lays nothing out, so
 * the canvas floor is invisible here in one direction — measured,
 * adding a spreadsheet's mime to `FLOORED_MIMES` survives this file
 * entirely, while taking archives out of it does not, because the
 * archive case asserts the flag. Whether the inspector is a pane, an
 * overlay or a sheet at a given width is `ShellLayout`'s own suite and
 * a browser's; the widths themselves were measured by hand.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import {
  claimSlot,
  loaded,
  makeFile,
  setApiResponses,
  slotMocks,
  usePolicyMock,
  setViewport,
  publishedPdfState,
  publishedArchiveState,
} from "./harness";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../../RelatedFilesSection", async () => ({
  RelatedFilesSection: (await import("./harness")).RelatedFilesSectionStub,
}));
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
// The real one pulls in react-pdf, whose worker needs a canvas jsdom has
// not got. What this suite asks is whether the tab exists, not what is
// drawn inside it; `usePdfState` is the real hook, so the condition that
// decides the tab is still the production one.
vi.mock("../pdf/PdfPagesTab", () => ({
  PdfPagesTab: () => <div data-testid="pdf-pages-tab" />,
}));

vi.mock("../../EditableTagChips", async () => ({
  EditableTagChips: (await import("./harness")).EditableTagChipsStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../ChaptersPanel", async () => ({
  ChaptersPanel: (await import("./harness")).ChaptersPanelStub,
}));
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const PDF = { mime_type: "application/pdf", file_type: "document" as const };
const ARCHIVE = { mime_type: "application/x-zip-compressed", file_type: "archive" as const };
const IMAGE = { mime_type: "image/jpeg", file_type: "image" as const };
/**
 * The kinds that were only ever a fallthrough.
 *
 * Two of them have a viewer (`TextPreview` reads the text ones), and two
 * have only the "cannot show this" panel with its download and its
 * extracted excerpt. Both halves are here because the skeleton is the
 * same question either way: the old stack gave all four a full-width
 * column of metadata and no inspector at all.
 */
const SPREADSHEET = {
  mime_type:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  file_type: "document" as const,
};
const WORD = {
  mime_type:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  file_type: "document" as const,
};
const TEXT = { mime_type: "text/plain", file_type: "document" as const };
const UNKNOWN = {
  mime_type: "application/octet-stream",
  file_type: "other" as const,
};

const SUBTITLE = { mime_type: "text/vtt", file_type: "subtitle" as const };

const KINDS: [string, Partial<FileItem>][] = [
  ["a PDF", PDF],
  ["an archive", ARCHIVE],
  ["an image", IMAGE],
  ["a spreadsheet", SPREADSHEET],
  ["a Word document", WORD],
  ["a plain text file", TEXT],
  ["a subtitle track", SUBTITLE],
  ["a file nothing can preview", UNKNOWN],
];

/**
 * The population, pinned — because `describe.each` will happily run a
 * shorter table and report a smaller, greener number.
 *
 * Measured before this existed: deleting the two rows this whole change
 * was made to add left `48 passed` and `tsc --noEmit` with no errors,
 * and nothing anywhere said 8 rows was ever the count. That is detector
 * rule 1's second sentence exactly — shrinking the measured scope
 * without moving the expected count is not shrinking it.
 *
 * Two assertions, because they fail on different things. The count
 * catches any row leaving. The `file_type` set catches a whole *kind*
 * leaving, which is the failure that matters here and which the count
 * would miss if a row were swapped rather than dropped — and it is
 * declared, not collected, so a deletion cannot take both sides with it.
 */
const KIND_COUNT = 8;

/**
 * Every `FileType` this suite is responsible for.
 *
 * Not all seven: `video` and `audio` ride the shell through
 * `MediaShell.test.tsx`, which owns the player-shaped rows this file has
 * no equivalent of. Written out rather than derived from `FileType` so
 * the split between the two suites is a statement someone has to change
 * on purpose.
 */
const COVERED_FILE_TYPES = ["archive", "document", "image", "other", "subtitle"];

describe("the kinds this suite covers", () => {
  it("runs every row it declares", () => {
    expect(KINDS).toHaveLength(KIND_COUNT);
  });

  it("covers every file_type that is not a player's", () => {
    expect([...new Set(KINDS.map(([, kind]) => kind.file_type))].sort()).toEqual(
      COVERED_FILE_TYPES,
    );
  });

  it("gives each row a distinct name and mime", () => {
    // A row duplicated rather than added keeps the count honest while
    // measuring the same thing twice.
    expect(new Set(KINDS.map(([name]) => name)).size).toBe(KIND_COUNT);
    expect(new Set(KINDS.map(([, kind]) => kind.mime_type)).size).toBe(
      KIND_COUNT,
    );
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  publishedPdfState.value = null;
  publishedArchiveState.value = null;
  slotMocks.entries.clear();
  window.localStorage.clear();
  // Clearing storage is not enough: `readMediaLayout` prefers the
  // attribute the store writes onto <html>, which outlives a test.
  // Without this a test that stores "stacked" still reads the "beside"
  // an earlier test left behind — and a companion gate that should have
  // failed passes, because on "beside" the companion is in the tab strip
  // whatever the gate says.
  document.documentElement.removeAttribute("data-media-layout");
  setViewport();
});

async function renderKind(kind: Partial<FileItem>) {
  // A non-empty description on purpose. The harness default is "", which
  // is what let this file miss the description being drawn twice: an
  // empty string renders nothing in either place, so both copies of
  // nothing looked like one.
  setApiResponses(
    makeFile({
      description: "Recorded on location.",
      // A folder, not the drive root. The back link resolves to the
      // drive either way, so a root file cannot tell a row that carries
      // the file's own folder from one that has forgotten it.
      folder_path: "Trips",
      ...kind,
      has_chapters: false,
    }),
  );
  const utils = render(<FileDetailContent fileId="f1" drive="main" />);
  await loaded();
  return utils;
}

const tabs = () =>
  screen.queryAllByRole("tab").map((tab) => tab.textContent?.trim());

describe.each(KINDS)("%s on the shell", (_name, kind) => {
  it("puts its viewer in the canvas, alone", async () => {
    // The whole of §7. Nothing else is in the column with it, so its
    // height is no longer what is left over after the metadata — and
    // going a level down inside it cannot move anything, because there
    // is nothing below it to move (ARC-5).
    const { container } = await renderKind(kind);

    const canvas = container.querySelector(".media-detail-host")!;
    expect(canvas).toContainElement(screen.getByTestId("file-preview"));
    expect(canvas).not.toContainElement(screen.getByTestId("file-action-row"));
    expect(canvas).not.toContainElement(screen.getByTestId("comments"));
  });

  it("draws the description once, and in the inspector", async () => {
    // A video's description is its show notes and reads with the player,
    // so the canvas takes it. A PDF's is a property of the file and
    // reads with the title and the size, so the inspector keeps it. Both
    // halves are one value in the container: spelled separately, the
    // canvas drew it for every kind while the inspector drew it for
    // every kind without a player, and three of them had it twice.
    //
    // `getAllByText(...).toHaveLength(1)` and not `toContain` on the
    // container's text: a substring check passes on two copies, which is
    // how this shipped in the first place.
    const { container } = await renderKind(kind);

    expect(screen.getAllByText("Recorded on location.")).toHaveLength(1);
    const canvas = container.querySelector(".media-detail-host")!;
    expect(canvas).not.toContainElement(
      screen.getByText("Recorded on location."),
    );
  });

  it("gives it the same fixed inspector as every other kind", async () => {
    // "The same shape on every kind of file" is the point of the shell:
    // a reader who has learnt where a file's tags are on a video finds
    // them in the same place on a PDF.
    await renderKind(kind);

    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    const row = screen.getByTestId("file-action-row");
    expect(row).toBeInTheDocument();
    // The inspector's row is not the compact strip, and it needs the touch
    // floor for the same reason: the same controls at a 2-4px pitch. The CSS
    // named only the compact class, so this row sat at 32px on a coarse
    // pointer — measured in a browser — while the strip cleared 44. jsdom does
    // no layout, so this pins the hook and `mediaDetailTheaterCss` pins the
    // rule it selects.
    expect(row.classList.contains("file-action-row-touch")).toBe(true);
    expect(row.classList.contains("file-action-row-compact")).toBe(false);
    expect(screen.getByTestId("comments")).toBeInTheDocument();
    expect(screen.getByTestId("related-files")).toBeInTheDocument();
  });

  it("draws exactly one page row, with exactly one way back in it", async () => {
    // The failure this replaces: a host drawing a row for a kind that
    // now brings its own gave two breadcrumbs and, on a phone, two back
    // controls.
    //
    // The back link is asserted here and not only in
    // `FileDetailPageRow.test.tsx`, which covers a note and a video —
    // both of which rode the shell already. For the kinds this change
    // moved, the row is new, and "the row exists" is not the property
    // MB-3 was about: a page row with no way out of it is the shape
    // that shipped once.
    await renderKind(kind);

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    const back = screen.getAllByTestId("file-detail-back");
    expect(back).toHaveLength(1);
    expect(back[0]).toHaveAttribute("href", "/drive/main/Trips");
  });

  it("offers no tab strip until something has a tab to claim", async () => {
    // §7 asks for the *container* for a page list, not for an empty tab
    // announcing that one could exist. When Phase 4 gives the archive
    // viewer a page list, its tab appears with no edit to the strip.
    //
    // The addon is installed and claiming the slot, on the default
    // `beside` preference — which is the arrangement where an entry that
    // reached the strip would become a tab. `stacked` cannot show this:
    // there the strip has no addon half at all, whatever the gate says.
    claimSlot("player-side", [
      { id: "transcript", label: "Transcript", priority: 10, addonName: "some-addon" },
    ]);
    await renderKind(kind);

    expect(tabs()).toEqual([]);
    expect(screen.queryByTestId("slot-entry-transcript")).toBeNull();
  });

  it("holds back from the inspector only what the canvas itself draws", async () => {
    // The canvas keeps the detailed summary, whose tables need width a
    // 384px column has not got. It does *not* draw the Knowledge editor
    // — that is the other form of this shell — so the inspector must be
    // asked for it rather than have it withheld. Excluding it here would
    // send it to neither column, which is how a video lost the knowledge
    // addon's card once already.
    await renderKind(kind);

    expect(
      screen.getByTestId("addon-slot-exclude:detailed-summary"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("addon-slot-exclude:knowledge-edit,detailed-summary"),
    ).toBeNull();
  });

  it("offers nothing that belongs to a player, on the stored preference that would show it", async () => {
    // A PDF has no playback clock, so nothing follows it. The companion,
    // its tabs and the control that moves them between the two are a
    // player's; a viewer that is not one has none of them. The addon is
    // installed here, which is exactly the case that used to conflate
    // "has a viewer" with "has a player".
    //
    // `stacked`, and not the default. On `beside` the companion is in
    // the tab strip whatever the player gate says, so a missing
    // `!hasPlayer` is invisible — which is where two of the three gates
    // were hiding.
    claimSlot("player-side", [
      { id: "transcript", label: "Transcript", priority: 10, addonName: "some-addon" },
    ]);
    window.localStorage.setItem("media-layout-preference", "stacked");
    const { container } = await renderKind(kind);

    expect(container.querySelector(".media-detail-below")).toBeNull();
    expect(screen.queryByTestId("slot-entry-transcript")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /transcript (beside|below) the player/i,
      }),
    ).toBeNull();
  });
});


describe("the PDF's page-list tab", () => {
  const renderPdf = async (state: NonNullable<typeof publishedPdfState.value>) => {
    publishedPdfState.value = state;
    return renderKind(PDF);
  };

  it("appears for a document with more than one page", async () => {
    await renderPdf({ numPages: 225, outline: [] });
    expect(tabs()).toEqual(["Info", "Pages"]);
  });

  it("appears for a one-page document that has an outline", async () => {
    // The condition is about what the document holds, not how long it is: a
    // single-page PDF with a table of contents still has somewhere to go.
    await renderPdf({
      numPages: 1,
      outline: [{ depth: 0, title: "Figure 1", page: 1 }],
    });
    expect(tabs()).toEqual(["Info", "Pages"]);
  });

  it("does not appear for a one-page document with nothing in it", async () => {
    await renderPdf({ numPages: 1, outline: [] });
    // And with `info` left alone, no tab strip at all — `buildInspectorTabs`
    // rule 2.
    expect(tabs()).toEqual([]);
  });

  it("does not appear for a file that publishes no document at all", async () => {
    // Every other kind on this shell. The tab must not be a PDF-shaped hole
    // in an image's inspector.
    publishedPdfState.value = null;
    await renderKind(PDF);
    expect(tabs()).toEqual([]);
  });
});


describe("the archive's page-list tab", () => {
  const entry = (path: string) => ({
    path,
    filename: path.split("/").pop()!,
    file_size: 10,
    compressed_size: 5,
    file_type: "image",
    mime_type: "image/jpeg",
    is_dir: path.endsWith("/"),
  });

  const renderArchive = async (paths: string[]) => {
    publishedArchiveState.value = {
      entries: paths.map(entry),
      currentPath: "",
    };
    return renderKind(ARCHIVE);
  };

  it("gives the archive an Info and a Pages tab, and no others", async () => {
    await renderArchive(["001.jpg", "002.jpg", "003.jpg"]);
    expect(tabs()).toEqual(["Info", "Pages"]);
  });

  it("indexes the whole archive, not the level the canvas is on", async () => {
    await renderArchive(["lib/", "lib/main.dart", "README.md"]);
    const rows = screen
      .getAllByTestId("archive-index-row")
      .map((row) => row.getAttribute("title"));
    expect(rows).toEqual(["lib/", "lib/main.dart", "README.md"]);
  });

  it("draws no strip for an archive holding one entry", async () => {
    // One entry is not an index: the canvas already shows it, so the tab
    // has nothing the canvas does not (rule 1), and with Info left alone
    // there is no strip either (rule 2).
    await renderArchive(["only.jpg"]);
    expect(tabs()).toEqual([]);
  });

  it("draws no strip for a file that publishes no archive at all", async () => {
    publishedArchiveState.value = null;
    await renderKind(ARCHIVE);
    expect(tabs()).toEqual([]);
  });

  it("marks an archive's canvas as the one the floor measures", async () => {
    const { container } = await renderArchive(["001.jpg", "002.jpg"]);
    expect(
      container.querySelector('main[data-canvas-floor="true"]'),
    ).not.toBeNull();
  });

  it("gives an image's canvas no floor", async () => {
    // `FilePreview` already caps an image at 70vh; a floor under it would
    // only add white space around a small photograph.
    const { container } = await renderKind(IMAGE);
    expect(container.querySelector('main[data-canvas-floor="true"]')).toBeNull();
  });

  it("gives a phone's canvas no floor, whatever the kind", async () => {
    // On a phone the canvas is the whole screen rather than a column
    // beside an inspector, so a short viewer leaves no empty gutter to
    // fix. And the player is `position: sticky` under
    // `[data-sheet-snap]`: a floor there pins 70% of the screen to the
    // top for the entire scroll, leaving the description and comments a
    // slot to be read through.
    setViewport(600);
    publishedArchiveState.value = {
      entries: [entry("001.jpg"), entry("002.jpg")],
      currentPath: "",
    };
    const { container } = await renderKind(ARCHIVE);
    expect(container.querySelector('main[data-canvas-floor="true"]')).toBeNull();
    // The same file on a wide screen does get one — otherwise this is
    // just an assertion that nothing anywhere has a floor.
    cleanup();
    setViewport();
    const wide = await renderKind(ARCHIVE);
    expect(
      wide.container.querySelector('main[data-canvas-floor="true"]'),
    ).not.toBeNull();
  });

  it("never gives a canvas holding a player one", async () => {
    // `container-type` around a `<video>` renders the whole subtree
    // rotated and spinning on iOS Safari (`DESIGN.md`). The exclusion is
    // in `viewerTakesCanvasFloor`, not in the CSS, so it is testable
    // here — jsdom evaluates no container query.
    const { container } = await renderKind({
      mime_type: "video/mp4",
      file_type: "video",
    });
    expect(container.querySelector('main[data-canvas-floor="true"]')).toBeNull();
  });

  it("gives a PDF's canvas the floor too", async () => {
    publishedPdfState.value = { numPages: 225, outline: [] };
    const { container } = await renderKind(PDF);
    expect(
      container.querySelector('main[data-canvas-floor="true"]'),
    ).not.toBeNull();
  });
});
