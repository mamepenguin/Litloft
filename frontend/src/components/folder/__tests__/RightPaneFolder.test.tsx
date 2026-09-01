import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFolders = vi.fn();
const mockGetDriveFiles = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: Array<{ id: string }> }) => (
    <div data-testid="file-grid">grid:{files.map((f) => f.id).join(",")}</div>
  ),
}));

vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: Array<{ id: string }> }) => (
    <div data-testid="file-list">list:{files.map((f) => f.id).join(",")}</div>
  ),
}));

vi.mock("@/components/FolderCard", () => ({
  FolderCard: ({ folder }: { folder: { name: string } }) => (
    <div data-testid="folder-card">{folder.name}</div>
  ),
}));

import { RightPaneFolder } from "../RightPaneFolder";

const sampleFile = (id: string) => ({
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "video" as const,
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
});

beforeEach(() => {
  mockGetFolders.mockReset();
  mockGetDriveFiles.mockReset();
  localStorage.removeItem("rightPaneFolder:viewMode");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem("rightPaneFolder:viewMode");
});

describe("RightPaneFolder", () => {
  it("renders folders and files in grid by default", async () => {
    mockGetFolders.mockResolvedValue([
      { name: "sub", path: "Q1/sub", file_count: 1, thumbnail_file_id: null, dominant_kind: null },
    ]);
    mockGetDriveFiles.mockResolvedValue({
      data: [sampleFile("a"), sampleFile("b")],
      meta: { total: 2, page: 1, limit: 100 },
    });

    render(<RightPaneFolder drive="work" folderPath="Q1" />);

    await waitFor(() => expect(screen.getByTestId("file-grid")).toHaveTextContent("a,b"));
    expect(screen.getByTestId("folder-card")).toHaveTextContent("sub");
  });

  it("toggles inner viewMode and persists to localStorage", async () => {
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({
      data: [sampleFile("a")],
      meta: { total: 1, page: 1, limit: 100 },
    });

    render(<RightPaneFolder drive="work" folderPath="Q1" />);

    await waitFor(() => expect(screen.getByTestId("file-grid")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("List view"));
    await waitFor(() => expect(screen.getByTestId("file-list")).toBeInTheDocument());
    expect(localStorage.getItem("rightPaneFolder:viewMode")).toBe("list");
  });

  it("shows empty state when folder is truly empty", async () => {
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 100 },
    });

    render(<RightPaneFolder drive="work" folderPath="Q1" />);

    await waitFor(() => expect(screen.getByText("No files")).toBeInTheDocument());
  });

  it("re-fetches when folderPath changes", async () => {
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100 } });

    const { rerender } = render(<RightPaneFolder drive="work" folderPath="Q1" />);
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalledTimes(1));

    rerender(<RightPaneFolder drive="work" folderPath="Q2" />);
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalledTimes(2));
    expect(mockGetDriveFiles).toHaveBeenLastCalledWith(
      "work",
      expect.objectContaining({ path: "Q2" }),
    );
  });
});
