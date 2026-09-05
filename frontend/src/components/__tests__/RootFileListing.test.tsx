/**
 * Tests for the right-pane filter wiring in RootFileListing.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2.
 *
 * RED phase — RootFileListing currently uses a bespoke type-filter row;
 * after Phase 4.4 it should host the shared <FilterField>. These tests
 * exercise the post-migration shape and are expected to fail until then.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({
  AddButton: () => <button>add</button>,
}));
vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button>sort</button>,
}));
vi.mock("@/components/ViewToggle", () => ({
  ViewToggle: () => <button>view</button>,
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button>tree</button>,
}));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: () => null,
}));
vi.mock("@/components/EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

// Capture how many files reach FileGrid.
vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-grid">{files.length} files</div>
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-list">{files.length} files</div>
  ),
}));

const mockGetDriveFiles = vi.fn();
const mockScanDrive = vi.fn();
const mockCreateFolder = vi.fn();
vi.mock("@/lib/api", () => {
  // useDriveScan's catch arm reads this class. A mock without it turns
  // any rejection there into an unhandled rejection that fails the whole
  // run without failing a test.
  class ApiStatusError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "ApiStatusError";
    }
  }
  return {
    ApiStatusError,
    getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
    scanDrive: (...args: unknown[]) => mockScanDrive(...args),
    createFolder: (...args: unknown[]) => mockCreateFolder(...args),
  };
});

import { RootFileListing } from "../RootFileListing";

function makeFile(id: string, filename: string, mime: string, type: FileItem["file_type"]): FileItem {
  return {
    id,
    filename,
    title: filename,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: type,
    mime_type: mime,
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  mockGetDriveFiles.mockReset();
  mockScanDrive.mockReset();
  mockCreateFolder.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RootFileListing right-pane filter (Phase 4)", () => {
  it("renders the FilterField input below the toolbar", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [
        makeFile("1", "spec.md", "text/markdown", "document"),
        makeFile("2", "intro.mp4", "video/mp4", "video"),
      ],
      meta: { total: 2, page: 1, limit: 30 },
    });

    render(<RootFileListing driveName="main" />);

    expect(
      await screen.findByPlaceholderText(
        /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
      ),
    ).toBeInTheDocument();
  });

  it("text filter narrows the visible files (client-side)", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [
        makeFile("1", "spec.md", "text/markdown", "document"),
        makeFile("2", "intro.mp4", "video/mp4", "video"),
        makeFile("3", "photo.jpg", "image/jpeg", "image"),
      ],
      meta: { total: 3, page: 1, limit: 30 },
    });

    render(<RootFileListing driveName="main" />);

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("3 files");
    });

    const input = await screen.findByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "intro" } });

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("1 files");
    });
  });

  it("shows the empty-filter message and a clear button when no files match", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [makeFile("1", "spec.md", "text/markdown", "document")],
      meta: { total: 1, page: 1, limit: 30 },
    });

    render(<RootFileListing driveName="main" />);

    // The filter box is on screen before the listing is, and the two
    // layouts do not share the input node: typing into the one the empty
    // listing rendered lands on a node React has already replaced by the
    // time the files arrive, and the filter reads empty.
    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("1 files");
    });
    const input = await screen.findByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "no-such-thing" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /no matching files in this folder|filter\.empty\.folder|このフォルダに該当するファイルはありません/i,
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /clear filters|filter\.clear|解除/i }),
    ).toBeInTheDocument();
  });

  it("empty-state clear button resets the filter and restores the file list", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [
        makeFile("1", "spec.md", "text/markdown", "document"),
        makeFile("2", "intro.mp4", "video/mp4", "video"),
      ],
      meta: { total: 2, page: 1, limit: 30 },
    });

    render(<RootFileListing driveName="main" />);

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("2 files");
    });
    const input = await screen.findByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    // Filter to a non-matching string so the empty-state UI (which now
    // owns the "Clear filters" button per spec §2.7 / H1) appears. The
    // X clear-input button is now labeled differently and is no longer
    // the universal global-clear affordance.
    fireEvent.change(input, { target: { value: "zzz-no-match" } });

    const clearBtn = await screen.findByRole("button", {
      name: /clear filters|filter\.clear|解除$/i,
    });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("2 files");
    });
  });
});

describe("RootFileListing toolbar right group (FolderToolbar parity)", () => {
  it("hides Selection mode and Rescan behind a More actions overflow menu", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [makeFile("1", "spec.md", "text/markdown", "document")],
      meta: { total: 1, page: 1, limit: 30 },
    });

    render(<RootFileListing driveName="main" />);

    const moreBtn = await screen.findByRole("button", { name: /more actions/i });

    // Mirrors FolderToolbar: Select Mode + Rescan are not surfaced as
    // bare pill buttons; they live inside the overflow menu.
    expect(
      screen.queryByRole("button", { name: /selection mode/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^rescan$/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(moreBtn);

    expect(
      await screen.findByRole("menuitem", { name: /selection mode/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /rescan/i }),
    ).toBeInTheDocument();
  });

  it("invokes a rescan from the overflow menu", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [makeFile("1", "spec.md", "text/markdown", "document")],
      meta: { total: 1, page: 1, limit: 30 },
    });
    mockScanDrive.mockResolvedValue({ added: 0, recovered: 0, missing: 0 });

    render(<RootFileListing driveName="main" />);

    fireEvent.click(await screen.findByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /rescan/i }));

    await waitFor(() => {
      expect(mockScanDrive).toHaveBeenCalledWith("main");
    });
  });
});

describe("RootFileListing with nothing directly under the drive", () => {
  // A drive that keeps every file inside a subfolder is in this state
  // permanently, so it is the most-seen instance of the rule, not the
  // rarest: the sort, the view toggle and a filter box sit over an
  // empty state on every visit.
  const empty = { data: [], meta: { total: 0, page: 1, limit: 30 } };

  it("puts the arranging controls away", async () => {
    mockGetDriveFiles.mockResolvedValue(empty);
    render(<RootFileListing driveName="main" />);

    await screen.findByTestId("empty-state");
    expect(screen.queryByText("sort")).toBeNull();
    expect(screen.queryByText("view")).toBeNull();
    expect(screen.queryByPlaceholderText(/filter/i)).toBeNull();
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("keeps the add menu, so the drive root can stop being empty", async () => {
    mockGetDriveFiles.mockResolvedValue(empty);
    render(<RootFileListing driveName="main" />);

    await screen.findByTestId("empty-state");
    expect(screen.getByText("add")).toBeInTheDocument();
  });

  it("keeps everything when there are files to arrange", async () => {
    mockGetDriveFiles.mockResolvedValue({
      data: [makeFile("1", "intro.mp4", "video/mp4", "video")],
      meta: { total: 1, page: 1, limit: 30 },
    });
    render(<RootFileListing driveName="main" />);

    await screen.findByTestId("file-grid");
    expect(screen.getByText("sort")).toBeInTheDocument();
    expect(screen.getByText("view")).toBeInTheDocument();
  });
});
