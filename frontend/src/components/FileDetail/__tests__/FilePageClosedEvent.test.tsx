import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import { FILE_PAGE_CLOSED_EVENT } from "@/lib/addonEvents";
import {
  loaded,
  makeFile,
  raiseSheetFromStrip,
  relationMocks,
  setApiResponses,
  setViewport,
  shellLoaded,
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

const closed: Array<{ fileId: string }> = [];

function onPageClosed(event: Event): void {
  closed.push((event as CustomEvent<{ fileId: string }>).detail);
}

beforeEach(() => {
  vi.clearAllMocks();
  relationMocks.value = [];
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
  window.localStorage.clear();
  setViewport();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  closed.length = 0;
  window.addEventListener(FILE_PAGE_CLOSED_EVENT, onPageClosed);
});

afterEach(() => {
  window.removeEventListener(FILE_PAGE_CLOSED_EVENT, onPageClosed);
});

async function renderFile(id: string) {
  setApiResponses(makeFile({ id, file_type: "video", mime_type: "video/mp4" }));
  const utils = render(<FileDetailContent fileId={id} drive="main" />);
  await loaded();
  return utils;
}

const sheetSnap = () =>
  screen.getByTestId("file-detail-shell").dataset.sheetSnap;

describe("SPEC-ADDON-056 I11 - the file page tells addons when the file it shows closes", () => {
  it("SPEC-ADDON-056 I11 - sends the old file's id once when the shown file changes", async () => {
    const { rerender } = await renderFile("f1");
    expect(closed).toEqual([]);

    setApiResponses(
      makeFile({ id: "f2", title: "Two", file_type: "video", mime_type: "video/mp4" }),
    );
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await loaded();

    expect(closed).toEqual([{ fileId: "f1" }]);
  });

  it("SPEC-ADDON-056 I11 - sends the current file's id once when the page unmounts", async () => {
    const { unmount } = await renderFile("f1");
    expect(closed).toEqual([]);

    unmount();

    expect(closed).toEqual([{ fileId: "f1" }]);
  });

  it("SPEC-ADDON-056 I11 - stays silent when the viewport crosses the mobile breakpoint", async () => {
    await renderFile("f1");

    act(() => {
      setViewport(400);
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => expect(sheetSnap()).toBe("peek"));
    expect(closed).toEqual([]);
  });

  it("SPEC-ADDON-056 I11 - stays silent when the inspector sheet opens and closes", async () => {
    setViewport(400);
    setApiResponses(
      makeFile({ id: "f1", file_type: "video", mime_type: "video/mp4" }),
    );
    render(<FileDetailContent fileId="f1" drive="main" />);
    await shellLoaded();

    raiseSheetFromStrip();
    await screen.findByTestId("mobile-inspector-sheet");
    expect(closed).toEqual([]);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull(),
    );
    expect(closed).toEqual([]);
  });

  it("SPEC-ADDON-056 I11 - stays silent when the active inspector tab changes", async () => {
    withRelations(1);
    await renderFile("f1");

    fireEvent.click(screen.getByRole("tab", { name: "Related" }));
    expect(closed).toEqual([]);

    fireEvent.click(screen.getByRole("tab", { name: "Info" }));
    expect(closed).toEqual([]);
  });
});
