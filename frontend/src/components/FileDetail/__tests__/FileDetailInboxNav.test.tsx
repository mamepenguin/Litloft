/**
 * SPEC-CORE-032 I15 — a file opened from the inbox is triaged in the detail
 * it lands in: every kind walks the arrivals with the page-row arrows and
 * offers Done beside them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastProvider";
import { FileDetailContent } from "../../FileDetailContent";
import { FileNavProvider, type FileNavState } from "@/lib/fileNavContext";
import {
  makeFile,
  setApiResponses,
  shellLoaded,
  usePolicyMock,
} from "./harness";
import type { FileItem } from "@/types";
import { InboxDetailHostProvider } from "@/components/inbox/inboxDetailHost";

let mockSearchParams = new URLSearchParams("nav=inbox");

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/notes",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
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
const apiMocks = vi.hoisted(() => ({
  getFile: vi.fn(),
  markInboxDone: vi.fn(),
  undoInboxDone: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
  markInboxDone: apiMocks.markInboxDone,
  undoInboxDone: apiMocks.undoInboxDone,
}));
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const walk: FileNavState = {
  prevId: "before",
  nextId: "after",
  position: 2,
  total: 4,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};

const onNext = vi.fn();
const onClose = vi.fn();

const KINDS: Array<[string, Partial<FileItem>]> = [
  ["image", { filename: "DSC_0412.jpg", file_type: "image", mime_type: "image/jpeg", duration: null }],
  ["video", { filename: "clip.mp4", file_type: "video", mime_type: "video/mp4" }],
  ["audio", { filename: "song.mp3", file_type: "audio", mime_type: "audio/mpeg" }],
  ["markdown", { filename: "note.md", file_type: "document", mime_type: "text/markdown", duration: null }],
  ["pdf", { filename: "book.pdf", file_type: "document", mime_type: "application/pdf", duration: null }],
  ["archive", { filename: "scan.zip", file_type: "archive", mime_type: "application/zip", duration: null }],
  ["html", { filename: "report.html", file_type: "document", mime_type: "text/html", duration: null }],
  ["loft", { filename: "talk.loft", file_type: "video", mime_type: "application/vnd.litloft.loft+json" }],
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams("nav=inbox");
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  apiMocks.markInboxDone.mockResolvedValue({
    done: 1,
    done_at: "2026-11-04T10:00:00.000000Z",
  });
});

async function renderKind(overrides: Partial<FileItem>) {
  setApiResponses(makeFile({ folder_path: "shots", ...overrides }));
  render(
    <ToastProvider>
      <FileNavProvider value={walk}>
        <InboxDetailHostProvider value={{ onNext, onClose }}>
          <FileDetailContent fileId="f1" drive="main" />
        </InboxDetailHostProvider>
      </FileNavProvider>
    </ToastProvider>,
  );
  await shellLoaded();
}

describe("SPEC-CORE-032 I15 the detail opened from the inbox", () => {
  it.each(KINDS)("offers the inbox arrows for a %s", async (_name, overrides) => {
    await renderKind(overrides);
    expect(screen.getByTestId("file-nav-controls")).toBeInTheDocument();
  });

  it("offers Done beside them, and moves to the next arrival", async () => {
    await renderKind(KINDS[3][1]);
    screen.getByRole("button", { name: "Done" }).click();

    await waitFor(() =>
      expect(apiMocks.markInboxDone).toHaveBeenCalledWith("main", {
        file_ids: ["f1"],
      }),
    );
    expect(onNext).toHaveBeenCalledWith("after");
  });

  it("closes back to the inbox when nothing follows", async () => {
    walk.nextId = null;
    await renderKind(KINDS[3][1]);
    screen.getByRole("button", { name: "Done" }).click();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    walk.nextId = "after";
  });
});
