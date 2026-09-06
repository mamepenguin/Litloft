/**
 * Which file kinds get visible prev / next in the page row.
 *
 * The arrow keys walk the folder for every non-media kind — image, PDF,
 * archive, text — but only the image surface draws buttons for it. On a
 * PDF or an archive the page row sits above a viewer that has its own
 * paging, and a second pair of arrows a few pixels away reads as that
 * viewer's.
 *
 * So the rule is a list of one, and a list of one is exactly the kind
 * that rots quietly: this file names each of the five kinds that must
 * not have it, rather than asserting the image case alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import { FileNavProvider, type FileNavState } from "@/lib/fileNavContext";
import { makeFile, setApiResponses, usePolicyMock } from "./harness";
import type { FileItem } from "@/types";

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

const walk: FileNavState = {
  prevId: "before",
  nextId: "after",
  position: 12,
  total: 995,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};

/** Every kind the shell hosts, with the one that gets the controls. */
const KINDS: Array<[string, Partial<FileItem>, boolean]> = [
  ["image", { filename: "DSC_0412.jpg", file_type: "image", mime_type: "image/jpeg", duration: null }, true],
  ["video", { filename: "clip.mp4", file_type: "video", mime_type: "video/mp4" }, false],
  ["audio", { filename: "song.mp3", file_type: "audio", mime_type: "audio/mpeg" }, false],
  ["markdown", { filename: "note.md", file_type: "document", mime_type: "text/markdown", duration: null }, false],
  ["pdf", { filename: "book.pdf", file_type: "document", mime_type: "application/pdf", duration: null }, false],
  ["archive", { filename: "scan.zip", file_type: "archive", mime_type: "application/zip", duration: null }, false],
  ["html", { filename: "report.html", file_type: "document", mime_type: "text/html", duration: null }, false],
  ["loft", { filename: "talk.loft", file_type: "video", mime_type: "application/vnd.litloft.loft+json" }, false],
];

beforeEach(() => {
  vi.clearAllMocks();
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
});

async function renderKind(overrides: Partial<FileItem>) {
  setApiResponses(makeFile({ folder_path: "shots", ...overrides }));
  render(
    <FileNavProvider value={walk}>
      <FileDetailContent fileId="f1" drive="main" />
    </FileNavProvider>,
  );
  await screen.findByTestId("file-detail-chrome");
}

describe("prev / next in the page row", () => {
  it.each(KINDS)("%s", async (_name, overrides, expected) => {
    await renderKind(overrides);
    expect(screen.queryAllByTestId("file-nav-controls")).toHaveLength(
      expected ? 1 : 0,
    );
  });

  it("covers every kind the shell hosts", () => {
    // Rule 7: "only the image kind has them" is also true of a table
    // with no image row in it. Both sides are named here. `text/html`
    // rides via `usesDocumentShell` and `.loft` via `playerKind`; both
    // were missing, so the table's name was wider than the table.
    expect(KINDS.filter(([, , shown]) => shown).map(([name]) => name)).toEqual([
      "image",
    ]);
    expect(KINDS.filter(([, , shown]) => !shown)).toHaveLength(7);
  });

  it("shows the place in the folder beside them, on the image", async () => {
    await renderKind(KINDS[0][1]);
    expect(screen.getByTestId("file-nav-position")).toHaveTextContent(
      "12 / 995",
    );
  });
});
