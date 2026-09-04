/**
 * PDF, archives and images on `FileDetailShell` — §7 of the 2026-09
 * redesign.
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
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
const ARCHIVE = { mime_type: "application/x-cbz", file_type: "archive" as const };
const IMAGE = { mime_type: "image/jpeg", file_type: "image" as const };

const KINDS: [string, Partial<FileItem>][] = [
  ["a PDF", PDF],
  ["an archive", ARCHIVE],
  ["an image", IMAGE],
];

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  setViewport();
});

async function renderKind(kind: Partial<FileItem>) {
  setApiResponses(makeFile({ ...kind, has_chapters: false }));
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

  it("gives it the same fixed inspector as every other kind", async () => {
    // "The same shape on every kind of file" is the point of the shell:
    // a reader who has learnt where a file's tags are on a video finds
    // them in the same place on a PDF.
    await renderKind(kind);

    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    expect(screen.getByTestId("file-action-row")).toBeInTheDocument();
    expect(screen.getByTestId("comments")).toBeInTheDocument();
    expect(screen.getByTestId("related-files")).toBeInTheDocument();
  });

  it("draws exactly one page row", async () => {
    // The failure this replaces: a host drawing a row for a kind that
    // now brings its own gave two breadcrumbs and, on a phone, two back
    // controls.
    await renderKind(kind);

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
  });

  it("offers no tab strip until something has a tab to claim", async () => {
    // §7 asks for the *container* for a page list, not for an empty tab
    // announcing that one could exist. When Phase 4 gives the archive
    // viewer a page list, its tab appears with no edit to the strip.
    await renderKind(kind);

    expect(tabs()).toEqual([]);
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

  it("offers nothing that belongs to a player", async () => {
    // A PDF has no playback clock, so nothing follows it. The companion,
    // its tabs and the control that moves them between the two are a
    // player's; a viewer that is not one has none of them. The addon is
    // installed here, which is exactly the case that used to conflate
    // "has a viewer" with "has a player".
    claimSlot("player-side", [
      { id: "transcript", label: "Transcript", priority: 10, addonName: "some-addon" },
    ]);
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
