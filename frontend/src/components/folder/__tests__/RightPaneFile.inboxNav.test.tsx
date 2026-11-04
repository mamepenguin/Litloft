/**
 * SPEC-CORE-032 I15 — the right pane's arrows belong to the inbox when the
 * URL says the file was opened there, and the URL keeps saying it.
 */

import { cleanup, fireEvent, screen, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  getFileShared: vi.fn(),
  getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  getInboxNeighbors: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));

const mockSearchParams = new URLSearchParams("file=abc123&nav=inbox");

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/drive/main/movies",
  useParams: () => ({}),
}));

vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: ({
    fileId,
    onBack,
  }: {
    fileId: string;
    onBack?: () => void;
  }) => (
    <div data-testid="file-detail-content">
      detail:{fileId}
      {onBack && (
        <button type="button" data-testid="detail-back" onClick={onBack} />
      )}
    </div>
  ),
}));

vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: () => <div data-testid="image-gallery" />,
}));

vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));

const mockClearFile = vi.fn();
const mockSelectFile = vi.fn();
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: "abc123",
    selectFile: mockSelectFile,
    clearFile: mockClearFile,
  }),
}));

const navResult = {
  prevId: "aaa" as string | null,
  nextId: "def" as string | null,
  position: 2 as number | null,
  total: 4 as number | null,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};
const useFileNavMock = vi.fn((_opts: Record<string, unknown>) => navResult);
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: (opts: Record<string, unknown>) => useFileNavMock(opts),
}));

import { getFileShared } from "@/lib/api";
import { _resetFileSeedForTests } from "@/lib/fileSeed";
import { RightPaneFile } from "../RightPaneFile";

const baseFile = {
  id: "abc123",
  filename: "doc.txt",
  title: "My Document",
  description: "",
  drive: "main",
  folder_path: "movies",
  file_type: "document" as const,
  mime_type: "text/plain",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified" as const,
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  image_width: null,
  image_height: null,
};

const lastNavOpts = () =>
  useFileNavMock.mock.calls.at(-1)?.[0] as {
    nav?: string;
    drive?: string;
    countable?: boolean;
    onNavigate: (id: string) => void;
  };

beforeEach(() => {
  vi.mocked(getFileShared).mockResolvedValue(baseFile);
  useFileNavMock.mockClear();
  mockClearFile.mockClear();
  mockSelectFile.mockClear();
  _resetFileSeedForTests();
});

afterEach(() => {
  cleanup();
});

describe("SPEC-CORE-032 I15 the right pane walks the inbox", () => {
  it("SPEC-CORE-032 I15 hands nav=inbox and the drive to the walk", async () => {
    render(<RightPaneFile fileId="abc123" drive="main" />);
    await waitFor(() => expect(useFileNavMock).toHaveBeenCalled());

    const opts = lastNavOpts();
    expect(opts.nav).toBe("inbox");
    expect(opts.drive).toBe("main");
  });

  it("SPEC-CORE-032 I15 moves through the arrival the walk names", async () => {
    render(<RightPaneFile fileId="abc123" drive="main" />);
    await waitFor(() => expect(useFileNavMock).toHaveBeenCalled());

    lastNavOpts().onNavigate("def");
    expect(mockSelectFile).toHaveBeenCalledWith("def");
  });

  it("SPEC-CORE-032 I15 closes back to the inbox from the detail's back control", async () => {
    render(<RightPaneFile fileId="abc123" drive="main" />);
    const back = await screen.findByTestId("detail-back");

    fireEvent.click(back);

    expect(mockClearFile).toHaveBeenCalledTimes(1);
  });

  it("SPEC-CORE-032 I15 publishes the inbox place to the controls", async () => {
    render(<RightPaneFile fileId="abc123" drive="main" />);
    await waitFor(() => expect(useFileNavMock).toHaveBeenCalled());
    expect(lastNavOpts().countable).not.toBe(false);
  });
});
