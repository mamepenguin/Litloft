import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import { SHEET_SNAP_HALF_FALLBACK } from "@/lib/sheetSnap";
import type { FileItem } from "@/types";
import {
  claimSlot,
  loaded,
  makeFile,
  publishedArchiveState,
  publishedPdfState,
  relationMocks,
  setApiResponses,
  setViewport,
  slotMocks,
  usePolicyMock,
  withRelations,
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
vi.mock("../related/RelatedPanel", async () => ({
  RelatedPanel: (await import("./harness")).RelatedPanelStub,
}));
vi.mock("../related/useFileRelations", async () => ({
  useFileRelations: (await import("./harness")).useFileRelationsStub,
}));

beforeEach(() => {
  relationMocks.value = [];
});
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
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
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
  ["a subtitle track", SUBTITLE],
  ["a file nothing can preview", UNKNOWN],
];

const KIND_COUNT = 5;

/**
 * One row per `file_type`, not per mime: the shell reads `file_type`, and
 * `FilePreview` — the one part that reads the mime — is stubbed here, so a
 * second document mime runs the same code as the first.
 *
 * Not all seven: `video` and `audio` ride the shell through
 * `MediaShell.test.tsx`. Written out rather than derived from `FileType` so
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
  document.documentElement.removeAttribute("data-media-layout");
  setViewport();
});

async function renderKind(kind: Partial<FileItem>) {
  // A non-empty description on purpose: the harness default "" renders
  // nothing in either place, so two copies of nothing look like one.
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
    const { container } = await renderKind(kind);

    const canvas = container.querySelector(".media-detail-host")!;
    expect(canvas).toContainElement(screen.getByTestId("file-preview"));
    expect(canvas).not.toContainElement(screen.getByTestId("file-action-row"));
    expect(canvas).not.toContainElement(screen.getByTestId("comments"));
  });

  it("draws the description once, and in the inspector", async () => {
    // `getAllByText(...).toHaveLength(1)` and not `toContain` on the
    // container's text: a substring check passes on two copies.
    const { container } = await renderKind(kind);

    expect(screen.getAllByText("Recorded on location.")).toHaveLength(1);
    const canvas = container.querySelector(".media-detail-host")!;
    expect(canvas).not.toContainElement(
      screen.getByText("Recorded on location."),
    );
  });

  it("gives it the same fixed inspector as every other kind", async () => {
    await renderKind(kind);

    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    const row = screen.getByTestId("file-action-row");
    expect(row).toBeInTheDocument();
    // The inspector's row is not the compact strip, and it needs the touch
    // floor for the same reason: the same controls at a 2-4px pitch.
    expect(row.classList.contains("file-action-row-touch")).toBe(true);
    expect(row.classList.contains("file-action-row-compact")).toBe(false);
    expect(screen.getByTestId("comments")).toBeInTheDocument();
  });

  it("draws exactly one page row, with exactly one way back in it", async () => {
    await renderKind(kind);

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    const back = screen.getAllByTestId("file-detail-back");
    expect(back).toHaveLength(1);
    expect(back[0]).toHaveAttribute("href", "/drive/main/Trips");
  });

  it("offers no tab strip until something has a tab to claim", async () => {
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
    // send it to neither column.
    await renderKind(kind);

    expect(
      screen.getByTestId("addon-slot-exclude:detailed-summary"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("addon-slot-exclude:knowledge-edit,detailed-summary"),
    ).toBeNull();
  });

  it("offers nothing that belongs to a player, on the stored preference that would show it", async () => {
    // `stacked`, and not the default. On `beside` the companion is in
    // the tab strip whatever the player gate says, so a missing
    // `!hasPlayer` is invisible.
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


describe.each([
  ["a PDF", PDF],
  ["an image", IMAGE],
  ["a plain text file", TEXT],
])("the Related tab on %s", (_name, kind) => {
  it("is listed after Info when the file has a relation", async () => {
    withRelations(1);
    await renderKind(kind);

    expect(tabs()).toEqual(["Info", "Related"]);
    const info = document.getElementById("inspector-panel-info")!;
    expect(info).not.toContainElement(screen.getByTestId("related-panel"));
  });

  it("is not listed with no relation and no derived source", async () => {
    await renderKind(kind);

    expect(tabs()).not.toContain("Related");
    expect(screen.queryByTestId("related-panel")).toBeNull();
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
    expect(tabs()).toEqual([]);
  });

  it("does not appear for a file that publishes no document at all", async () => {
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
    // rotated and spinning on iOS Safari (`DESIGN.md`).
    const { container } = await renderKind({
      mime_type: "video/mp4",
      file_type: "video",
    });
    expect(container.querySelector('main[data-canvas-floor="true"]')).toBeNull();
  });

  it("keeps the sheet's fixed half where there is no player", async () => {
    // `half` is derived from the *player's* bottom edge, and a viewer is
    // not a player: a PDF, an archive and a photograph all draw inside
    // the same `.media-detail-player` wrapper, so a gate written on
    // "does this canvas have a viewer" would derive a snap from a
    // document's first page. The gate is `hasPlayer`.
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("media-detail-player")) {
        return { ...new DOMRect(0, 104, 400, 211), bottom: 315 } as DOMRect;
      }
      return original.call(this);
    };
    try {
      setViewport(600);
      publishedPdfState.value = { numPages: 225, outline: [] };
      await renderKind(PDF);

      fireEvent.click(screen.getByTestId("inspector-toggle"));
      const drawer = await screen.findByTestId("mobile-inspector-sheet");
      const published = Number.parseFloat(
        drawer.style.getPropertyValue("--snap-point-height"),
      );
      expect(1 - published / window.innerHeight).toBeCloseTo(
        SHEET_SNAP_HALF_FALLBACK,
        5,
      );
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("gives a PDF's canvas the floor too", async () => {
    publishedPdfState.value = { numPages: 225, outline: [] };
    const { container } = await renderKind(PDF);
    expect(
      container.querySelector('main[data-canvas-floor="true"]'),
    ).not.toBeNull();
  });
});
