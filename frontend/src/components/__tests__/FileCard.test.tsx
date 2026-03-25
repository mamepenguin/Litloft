import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileCard } from "../FileCard";
import type { FileItem } from "@/types";

const mockFile: FileItem = {
  id: "abc123def456",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "test-drive",
  folder_path: "旅行",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/abc123def456/thumbnail",
  file_size: 1048576,
  duration: 125.5,
  likes: 3,
  dislikes: 1,
  is_favorite: false,
  tags: [],
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
};

describe("FileCard", () => {
  it("renders title", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("Test Video")).toBeInTheDocument();
  });

  it("renders file size and relative date", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
  });

  it("renders formatted duration for video", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("links to file page", () => {
    render(<FileCard file={mockFile} />);
    const links = screen.getAllByRole("link");
    const fileLink = links.find((l) => l.getAttribute("href") === "/files/abc123def456");
    expect(fileLink).toBeTruthy();
  });

  it("renders thumbnail image for video", () => {
    render(<FileCard file={mockFile} />);
    const img = screen.getByAltText("Test Video");
    expect(img).toHaveAttribute("src", "/api/files/abc123def456/thumbnail");
  });

  it("does not show duration for non-media files", () => {
    render(<FileCard file={{ ...mockFile, file_type: "document", duration: null }} />);
    expect(screen.queryByText("2:05")).toBeNull();
  });

  it("shows file type icon for non-video files", () => {
    render(<FileCard file={{ ...mockFile, file_type: "document", mime_type: "application/pdf" }} />);
    expect(screen.queryByAltText("Test Video")).toBeNull();
  });
});
