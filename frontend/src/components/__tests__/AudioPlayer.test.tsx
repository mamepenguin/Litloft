import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudioPlayer } from "../AudioPlayer";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0 }),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

const mockFile: FileItem = {
  id: "audio-1",
  filename: "song.mp3",
  title: "Test Song",
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "audio",
  mime_type: "audio/mp3",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 5000000,
  duration: 180,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("AudioPlayer", () => {
  it("renders audio element with correct src", () => {
    render(<AudioPlayer file={mockFile} />);
    const audio = document.querySelector("audio");
    expect(audio).toBeInTheDocument();
    expect(audio?.getAttribute("src")).toBe("/api/files/audio-1/stream");
  });

  it("displays filename and file size", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.getByText("4.8 MB")).toBeInTheDocument();
  });

  it("renders file type icon", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByTestId("icon-audio")).toBeInTheDocument();
  });

  it("calls onEnded when audio ends", () => {
    const onEnded = vi.fn();
    render(<AudioPlayer file={mockFile} onEnded={onEnded} />);
    const audio = document.querySelector("audio")!;
    audio.dispatchEvent(new Event("ended"));
    expect(onEnded).toHaveBeenCalled();
  });

  it("renders fallback text", () => {
    render(<AudioPlayer file={mockFile} />);
    expect(screen.getByText("Your browser does not support audio playback.")).toBeInTheDocument();
  });
});
