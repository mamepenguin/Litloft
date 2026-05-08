import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/drive/work";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

const mockGetFolderTree = vi.fn();
const mockGetFolders = vi.fn();
const mockGetDriveFiles = vi.fn();
const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getFile: (...args: unknown[]) => mockGetFile(...args),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("@/components/FilePreview", () => ({
  FilePreview: ({ file }: { file: { id: string } }) => (
    <div data-testid="file-preview">preview:{file.id}</div>
  ),
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: Array<{ id: string }> }) => (
    <div data-testid="file-grid">{files.map((f) => f.id).join(",")}</div>
  ),
}));

vi.mock("@/components/FileList", () => ({
  FileList: () => <div data-testid="file-list" />,
}));

vi.mock("@/components/FolderCard", () => ({
  FolderCard: ({ folder }: { folder: { name: string } }) => (
    <div data-testid="folder-card">{folder.name}</div>
  ),
}));

// Stub virtualizer (jsdom layout) — keep parity with FolderTreePane test.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    const rows = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * estimateSize(i),
      size: estimateSize(i),
      lane: 0,
    }));
    return {
      getTotalSize: () => count * estimateSize(0),
      getVirtualItems: () => rows,
      measureElement: () => undefined,
    };
  },
}));

import { TwoPaneLayout } from "../TwoPaneLayout";

const baseFile = (id: string) => ({
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
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
});

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
  mockGetFolderTree.mockReset();
  mockGetFolders.mockReset();
  mockGetDriveFiles.mockReset();
  mockGetFile.mockReset();
  mockPathname = "/drive/work";
  mockSearchParams = new URLSearchParams();
  localStorage.removeItem("tree:expanded:work");
  localStorage.removeItem("tree:typeFilter:work");
  localStorage.removeItem("rightPaneFolder:viewMode");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TwoPaneLayout", () => {
  it("renders folder right pane when no ?file param", async () => {
    mockGetFolderTree.mockResolvedValue([]);
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({
      data: [baseFile("v1")],
      meta: { total: 1, page: 1, limit: 100 },
    });

    render(<TwoPaneLayout drive="work" folderPath="" />);

    await waitFor(() => expect(screen.getByTestId("file-grid")).toHaveTextContent("v1"));
  });

  it("renders file right pane when ?file is present", async () => {
    mockSearchParams = new URLSearchParams("file=abc");
    mockGetFolderTree.mockResolvedValue([]);
    mockGetFile.mockResolvedValue(baseFile("abc"));

    render(<TwoPaneLayout drive="work" folderPath="" />);

    await waitFor(() => expect(screen.getByTestId("file-preview")).toHaveTextContent("preview:abc"));
  });

  it("folder click in tree pushes to drive path (not replace)", async () => {
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 1, has_children: false },
        ]);
      }
      return Promise.resolve([]);
    });
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100 } });

    render(<TwoPaneLayout drive="work" folderPath="" />);

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Q1"));

    expect(mockPush).toHaveBeenCalledWith("/drive/work/Q1");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("first file click in tree pushes ?file (history entry)", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "doc.md", path: "doc.md", file_id: "fid42", file_type: "document", mime_type: "text/markdown" },
    ]);
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100 } });

    render(<TwoPaneLayout drive="work" folderPath="" />);

    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());
    fireEvent.click(screen.getByText("doc.md"));

    // First selection (tree-mode → file-mode) earns a history entry so swipe
    // back returns to the tree once (B6, hako l3PpLicBu_d9s7zzYIla-).
    expect(mockPush).toHaveBeenCalledWith("/drive/work?file=fid42");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("switching to another file in tree replaces ?file (no extra history)", async () => {
    mockSearchParams = new URLSearchParams("file=fid01");
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "doc.md", path: "doc.md", file_id: "fid42", file_type: "document", mime_type: "text/markdown" },
    ]);
    mockGetFolders.mockResolvedValue([]);
    mockGetFile.mockResolvedValue(baseFile("fid01"));
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100 } });

    render(<TwoPaneLayout drive="work" folderPath="" />);

    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());
    fireEvent.click(screen.getByText("doc.md"));

    expect(mockReplace).toHaveBeenCalledWith("/drive/work?file=fid42");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("encodes drive name with spaces in folder navigation", async () => {
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 0, has_children: false },
        ]);
      }
      return Promise.resolve([]);
    });
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 100 } });

    render(<TwoPaneLayout drive="my drive" folderPath="" />);

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Q1"));

    expect(mockPush).toHaveBeenCalledWith("/drive/my%20drive/Q1");
  });
});
