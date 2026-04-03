import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockGetDrives = vi.fn();
const mockGetDuplicates = vi.fn();
const mockBatchDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  getDrives: (...args: unknown[]) => mockGetDrives(...args),
  getDuplicates: (...args: unknown[]) => mockGetDuplicates(...args),
  batchDelete: (...args: unknown[]) => mockBatchDelete(...args),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DuplicatesSection } from "@/components/DuplicatesSection";
import type { DuplicatesResponse, FileItem } from "@/types";

const makeDrive = (name: string) => ({ name, protected: false });

const makeFile = (id: string, overrides?: Partial<FileItem>): FileItem => ({
  id,
  filename: `${id}.jpg`,
  title: `File ${id}`,
  description: "",
  drive: "media",
  folder_path: "/photos",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  file_size: 1024000,
  duration: null,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

const makeDuplicatesResponse = (groups: DuplicatesResponse["groups"]): DuplicatesResponse => {
  const totalWasted = groups.reduce((sum, g) => {
    const sizes = g.files.map((f) => f.file_size);
    return sum + sizes.slice(1).reduce((s, v) => s + v, 0);
  }, 0);
  return {
    groups,
    total_groups: groups.length,
    total_wasted_bytes: totalWasted,
  };
};

describe("DuplicatesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDrives.mockResolvedValue([makeDrive("media"), makeDrive("backup")]);
    mockGetDuplicates.mockResolvedValue(makeDuplicatesResponse([]));
    mockBatchDelete.mockResolvedValue({ deleted: 1, errors: [] });
  });

  it("renders drive selector", async () => {
    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(3); // placeholder + 2 drives
  });

  it("shows loading state when fetching duplicates", async () => {
    let resolvePromise: (value: DuplicatesResponse) => void;
    mockGetDuplicates.mockReturnValue(
      new Promise<DuplicatesResponse>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("重複ファイル")).toBeTruthy();
    });

    // Verify the skeleton is shown (animate-pulse class)
    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeTruthy();

    // Resolve to clean up
    resolvePromise!(makeDuplicatesResponse([]));
  });

  it("shows empty state when no duplicates found", async () => {
    mockGetDuplicates.mockResolvedValue(makeDuplicatesResponse([]));

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("重複ファイルはありません")).toBeTruthy();
    });

    expect(screen.getByText("このドライブには重複ファイルがありません。")).toBeTruthy();
  });

  it("renders duplicate groups with stats", async () => {
    const response = makeDuplicatesResponse([
      {
        hash: "abc123",
        total_size: 2048000,
        files: [
          makeFile("file1", { filename: "photo.jpg", folder_path: "/photos" }),
          makeFile("file2", { filename: "photo.jpg", folder_path: "/backup" }),
        ],
      },
    ]);
    mockGetDuplicates.mockResolvedValue(response);

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("1 グループ")).toBeTruthy();
    });

    // Group header shows filename and file count
    expect(screen.getByText("photo.jpg")).toBeTruthy();
    expect(screen.getByText(/2 件のファイル/)).toBeTruthy();
  });

  it("expands group and shows file list with checkbox selection", async () => {
    const response = makeDuplicatesResponse([
      {
        hash: "abc123",
        total_size: 2048000,
        files: [
          makeFile("file1", { filename: "photo.jpg", folder_path: "/photos" }),
          makeFile("file2", { filename: "photo.jpg", folder_path: "/backup" }),
        ],
      },
    ]);
    mockGetDuplicates.mockResolvedValue(response);

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo.jpg")).toBeTruthy();
    });

    // Expand the group
    fireEvent.click(screen.getByText("photo.jpg"));

    await waitFor(() => {
      // Both files should be visible with their folder paths
      const folderPaths = screen.getAllByText(/\/(photos|backup)/);
      expect(folderPaths.length).toBeGreaterThanOrEqual(2);
    });

    // First file should be marked as "keep" by default
    expect(screen.getByText("保持")).toBeTruthy();

    // Checkboxes should exist
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
  });

  it("checkbox selection toggles keep status", async () => {
    const response = makeDuplicatesResponse([
      {
        hash: "abc123",
        total_size: 2048000,
        files: [
          makeFile("file1", { filename: "photo1.jpg", folder_path: "/photos" }),
          makeFile("file2", { filename: "photo2.jpg", folder_path: "/backup" }),
        ],
      },
    ]);
    mockGetDuplicates.mockResolvedValue(response);

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo1.jpg")).toBeTruthy();
    });

    // Expand
    fireEvent.click(screen.getByText("photo1.jpg"));

    await waitFor(() => {
      expect(screen.getAllByRole("checkbox").length).toBe(2);
    });

    // Click on second file's checkbox to make it the kept one
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    // The "Keep" badge should still exist (now on the second file)
    expect(screen.getByText("保持")).toBeTruthy();
  });

  it("delete button triggers batch delete API", async () => {
    const response = makeDuplicatesResponse([
      {
        hash: "abc123",
        total_size: 2048000,
        files: [
          makeFile("file1", { filename: "photo.jpg", folder_path: "/photos" }),
          makeFile("file2", { filename: "photo_copy.jpg", folder_path: "/backup" }),
        ],
      },
    ]);
    mockGetDuplicates.mockResolvedValue(response);

    render(<DuplicatesSection />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo.jpg")).toBeTruthy();
    });

    // Expand group
    fireEvent.click(screen.getByText("photo.jpg"));

    await waitFor(() => {
      expect(screen.getByText(/選択したファイルを削除/)).toBeTruthy();
    });

    // Click delete button
    fireEvent.click(screen.getByText(/選択したファイルを削除/));

    await waitFor(() => {
      // Should call batchDelete with the non-kept file IDs
      expect(mockBatchDelete).toHaveBeenCalledWith(["file2"]);
    });

    // Should refresh duplicates after delete
    expect(mockGetDuplicates).toHaveBeenCalledTimes(2);
  });
});
