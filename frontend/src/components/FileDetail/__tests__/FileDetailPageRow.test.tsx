/**
 * This file leaves `markdown/MarkdownDocumentLayout` real and stubs only the
 * leaves below it, because that layout is where a second row would come from.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import {
  loaded,
  makeFile,
  relationMocks,
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
// Both exports: `ShellLayout` takes `SlotEntryRenderer` by name, so a
// factory that returns only `AddonSlot` leaves it `undefined`.
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
    // inspector closed, so `file-actions` never appears.
    await screen.findByTestId("file-detail-chrome");

    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    expect(screen.getAllByTestId("file-detail-back")).toHaveLength(1);
  });

  it("puts the file's own folder in that row", async () => {
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
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" surface="collection" />);
    await loaded();

    expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
    expect(api.getFile).toHaveBeenCalledWith("f1");
  });
});
