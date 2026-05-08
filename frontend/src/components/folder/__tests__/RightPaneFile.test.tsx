import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: (...args: unknown[]) => mockGetFile(...args),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

// FilePreview pulls in many media-related side effects; stub it so the
// test focuses on RightPaneFile's own contract: title, link, no editor.
vi.mock("@/components/FilePreview", () => ({
  FilePreview: ({ file }: { file: { id: string } }) => (
    <div data-testid="file-preview">preview:{file.id}</div>
  ),
}));

const mockClearFile = vi.fn();
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: null, selectFile: vi.fn(), clearFile: mockClearFile }),
}));

import { RightPaneFile } from "../RightPaneFile";

const baseFile = {
  id: "abc123",
  filename: "doc.md",
  title: "My Document",
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "document" as const,
  mime_type: "text/markdown",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: null,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

beforeEach(() => {
  mockGetFile.mockReset();
  mockClearFile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RightPaneFile", () => {
  it("shows loading then file content", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("My Document")).toBeInTheDocument());
    expect(screen.getByTestId("file-preview")).toHaveTextContent("preview:abc123");
  });

  it("falls back to filename when title is empty", async () => {
    mockGetFile.mockResolvedValue({ ...baseFile, title: "" });
    render(<RightPaneFile fileId="abc123" />);
    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());
  });

  it("renders 'Open details' link to /files/{id}", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" />);
    await waitFor(() => {
      const link = screen.getByText("Open details").closest("a");
      expect(link).toHaveAttribute("href", "/files/abc123");
    });
  });

  it("shows error state when fetch fails", async () => {
    mockGetFile.mockRejectedValue(new Error("404"));
    render(<RightPaneFile fileId="abc123" />);
    await waitFor(() => expect(screen.getByText("File not found")).toBeInTheDocument());
  });

  it("re-fetches when fileId prop changes", async () => {
    mockGetFile.mockResolvedValueOnce(baseFile).mockResolvedValueOnce({ ...baseFile, id: "z9", title: "Other" });
    const { rerender } = render(<RightPaneFile fileId="abc123" />);
    await waitFor(() => expect(screen.getByText("My Document")).toBeInTheDocument());

    rerender(<RightPaneFile fileId="z9" />);
    await waitFor(() => expect(screen.getByText("Other")).toBeInTheDocument());
    expect(mockGetFile).toHaveBeenCalledTimes(2);
  });

  it("renders 'Back to tree' button that calls clearFile", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" />);
    await waitFor(() => expect(screen.getByText("My Document")).toBeInTheDocument());

    const backBtn = screen.getByRole("button", { name: /back to tree/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockClearFile).toHaveBeenCalledTimes(1);
  });
});
