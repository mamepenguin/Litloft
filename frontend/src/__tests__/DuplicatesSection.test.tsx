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
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.jpg`,
  title: `File ${id}`,
  description: "",
  drive: "media",
  folder_path: "/photos",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024000,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  modified_at: null,
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

/**
 * The combobox is rendered before the drives arrive, so waiting for it alone
 * lets a change to "media" be dropped as a value the select does not have.
 */
async function selectWithDrives(): Promise<HTMLElement> {
  await screen.findByRole("option", { name: "media" });
  return screen.getByRole("combobox");
}

describe("DuplicatesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDrives.mockResolvedValue([makeDrive("media"), makeDrive("backup")]);
    mockGetDuplicates.mockResolvedValue(makeDuplicatesResponse([]));
    mockBatchDelete.mockResolvedValue({ deleted: 1, errors: [] });
  });

  it("renders drive selector", async () => {
    render(<DuplicatesSection />);

    const select = await selectWithDrives();
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

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("Duplicate Files")).toBeTruthy();
    });

    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeTruthy();

    resolvePromise!(makeDuplicatesResponse([]));
  });

  it("shows empty state when no duplicates found", async () => {
    mockGetDuplicates.mockResolvedValue(makeDuplicatesResponse([]));

    render(<DuplicatesSection />);

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("No Duplicates")).toBeTruthy();
    });

    expect(screen.getByText("No duplicate files found in this drive.")).toBeTruthy();
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

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("1 groups")).toBeTruthy();
    });

    expect(screen.getByText("photo.jpg")).toBeTruthy();
    expect(screen.getByText(/2 files/)).toBeTruthy();
  });

  it("expands group and shows file list with one keep choice per file", async () => {
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

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo.jpg")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("photo.jpg"));

    await waitFor(() => {
      const folderPaths = screen.getAllByText(/\/(photos|backup)/);
      expect(folderPaths.length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Keep")).toBeTruthy();

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  // UNSPEC: the marked file is the one kept; the delete button names the files
  // that are not marked, so marking a file can never read as choosing it for
  // deletion.
  it("keeps the marked file and deletes the others", async () => {
    const response = makeDuplicatesResponse([
      {
        hash: "abc123",
        total_size: 3072000,
        files: [
          makeFile("file1", { filename: "photo1.jpg", folder_path: "/photos" }),
          makeFile("file2", { filename: "photo2.jpg", folder_path: "/backup" }),
          makeFile("file3", { filename: "photo3.jpg", folder_path: "/old" }),
        ],
      },
    ]);
    mockGetDuplicates.mockResolvedValue(response);

    render(<DuplicatesSection />);

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo1.jpg")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("photo1.jpg"));

    await waitFor(() => {
      expect(screen.getAllByRole("radio").length).toBe(3);
    });

    fireEvent.click(screen.getAllByRole("radio")[1]);

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    await waitFor(() => {
      expect(screen.getByText(/Move.*to trash/i)).toBeTruthy();
    });
    const confirmButtons = screen.getAllByRole("button", { name: /Delete/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledWith(["file1", "file3"]);
    });
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

    fireEvent.change(await selectWithDrives(), { target: { value: "media" } });

    await waitFor(() => {
      expect(screen.getByText("photo.jpg")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("photo.jpg"));

    await waitFor(() => {
      expect(screen.getByText(/Delete/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Delete/));

    // The last button with this label is the one inside the dialog.
    await waitFor(() => {
      expect(screen.getByText(/Move.*to trash/i)).toBeTruthy();
    });
    const deleteButtons = screen.getAllByText(/Delete/);
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledWith(["file2"]);
    });

    expect(mockGetDuplicates).toHaveBeenCalledTimes(2);
  });
});
