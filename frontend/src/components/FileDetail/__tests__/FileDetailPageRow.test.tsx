/**
 * How many page rows a file detail surface ends up with.
 *
 * The other suites in this directory stub `markdown/MarkdownDocumentLayout`,
 * which is where the second row comes from — so none of them can see a
 * duplicate, and one shipped. This file leaves the shell real and stubs
 * only the leaves below it, so the row it draws is the row a reader
 * would get.
 *
 * It covers the content's half. The host's half — whether `RightPaneFile`
 * and `FileDetailFullScreen` add one of their own — is in those hosts'
 * own suites, where the guard lives.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import {
  loaded,
  makeFile,
  setApiResponses,
  usePolicyMock,
} from "./harness";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/notes",
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
// Both exports: `ShellLayout` takes `SlotEntryRenderer` by name, so a
// factory that returns only `AddonSlot` leaves it `undefined`. It is
// harmless while no suite here claims a `player-side` entry, and the
// moment one does the failure is `Element type is invalid` pointing at
// nothing in particular.
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
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const markdownFile = () =>
  makeFile({
    filename: "note.md",
    title: "A note",
    mime_type: "text/markdown",
    file_type: "document",
    folder_path: "notes",
  });

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
});

describe("file detail page row", () => {
  it("draws exactly one for a file that rides the shell", async () => {
    setApiResponses(markdownFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    // Waited on rather than `loaded()`: on this branch the action row
    // lives in the inspector, and jsdom's 1024px viewport leaves the
    // inspector closed, so `file-actions` never appears. The row itself
    // is what these assertions are about anyway.
    await screen.findByTestId("file-detail-chrome");

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    expect(screen.getAllByTestId("file-detail-back")).toHaveLength(1);
  });

  it("puts the file's own folder in that row", async () => {
    // `folderPath` is threaded from the resolved file through the
    // presenter and the Markdown wrapper before it reaches the
    // breadcrumb. Every step of that is invisible to the suites that
    // stub the wrapper: delete the prop and they all stay green.
    setApiResponses(markdownFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    const row = await screen.findByTestId("file-detail-chrome");
    expect(row).toHaveTextContent("notes");
    expect(screen.getByTestId("file-detail-back")).toHaveAttribute(
      "href",
      "/drive/main/notes",
    );
  });

  it("draws exactly one for a video, which rides the shell too now", async () => {
    setApiResponses(makeFile({ folder_path: "clips" }));
    render(<FileDetailContent fileId="f1" drive="main" />);
    const row = await screen.findByTestId("file-detail-chrome");

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    expect(screen.getAllByTestId("file-detail-back")).toHaveLength(1);
    expect(row).toHaveTextContent("clips");
    expect(api.getFile).toHaveBeenCalledWith("f1");
  });

  it("draws none on the collection route, where the host owns the row", async () => {
    // `/files/{id}` keeps the legacy stack, so its row comes from the
    // host — which is not mounted here. Nothing in between may draw one.
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" surface="collection" />);
    await loaded();

    expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
    expect(api.getFile).toHaveBeenCalledWith("f1");
  });
});
