import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilePreview } from "../FilePreview";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("../VideoPlayer", () => ({
  VideoPlayer: ({ videoId }: { videoId: string }) => (
    <div data-testid="video-player">{videoId}</div>
  ),
}));

vi.mock("../AudioPlayer", () => ({
  AudioPlayer: ({ file }: { file: FileItem }) => (
    <div data-testid="audio-player">{file.filename}</div>
  ),
}));

vi.mock("../ArchivePreview", () => ({
  ArchivePreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="archive-preview">{fileId}</div>
  ),
}));

vi.mock("../HtmlPreview", () => ({
  HtmlPreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="html-preview">{fileId}</div>
  ),
}));

vi.mock("../PdfPreview", () => ({
  PdfPreview: ({ fileId, initialPage }: { fileId: string; initialPage?: number }) => (
    <div data-testid="pdf-preview">{fileId}:{initialPage ?? 1}</div>
  ),
}));

vi.mock("../TextPreview", () => ({
  TextPreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="text-preview">{fileId}</div>
  ),
  isTextPreviewable: (mime: string) => mime === "text/plain",
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

vi.mock("../loft/LoftPlayer", () => ({
  default: ({ fileId }: { fileId: string }) => (
    <div data-testid="loft-player">{fileId}</div>
  ),
}));

vi.mock("../AddonSlot", () => ({
  AddonSlot: () => null,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "file-1",
    filename: "test.mp4",
    title: "Test",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 60,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("FilePreview", () => {
  it("renders VideoPlayer for video files", () => {
    render(<FilePreview file={makeFile()} />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("renders image for image files", () => {
    const file = makeFile({ file_type: "image", mime_type: "image/jpeg", filename: "photo.jpg" });
    render(<FilePreview file={file} />);
    const img = screen.getByAltText("Test");
    expect(img).toHaveAttribute("src", "/api/files/file-1/stream");
  });

  it("renders SVG file via img tag with stream URL", () => {
    // Regression guard for the stream XSS hardening
    // (docs/superpowers/specs/2026-05-09-stream-xss-hardening.md):
    // SVG must keep going through <img> so that
    // ``Content-Disposition: attachment`` on the stream endpoint is
    // ignored as a sub-resource (browsers honour attachment only on
    // top-level navigation). Swapping to <iframe> would break SVG
    // display because attachment IS honoured on iframe loads.
    const file = makeFile({
      file_type: "image",
      mime_type: "image/svg+xml",
      filename: "logo.svg",
    });
    render(<FilePreview file={file} />);
    const img = screen.getByAltText("Test");
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/api/files/file-1/stream");
  });

  it("renders AudioPlayer for audio files", () => {
    const file = makeFile({ file_type: "audio", mime_type: "audio/mp3", filename: "song.mp3" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("audio-player")).toBeInTheDocument();
  });

  it("renders the selectable PDF viewer at the requested page", () => {
    const file = makeFile({ file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" });
    render(<FilePreview file={file} initialPage={4} />);
    expect(screen.getByTestId("pdf-preview")).toHaveTextContent("file-1:4");
  });

  it("renders ArchivePreview for archive files", () => {
    const file = makeFile({ file_type: "archive", mime_type: "application/zip", filename: "files.zip" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("archive-preview")).toBeInTheDocument();
  });

  it("renders TextPreview for text files", () => {
    const file = makeFile({ file_type: "document", mime_type: "text/plain", filename: "readme.txt" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("text-preview")).toBeInTheDocument();
  });

  it("renders HtmlPreview for text/html files", () => {
    const file = makeFile({
      id: "html-1",
      file_type: "document",
      mime_type: "text/html",
      filename: "artifact.html",
    });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("html-preview")).toBeInTheDocument();
    expect(screen.getByTestId("html-preview")).toHaveTextContent("html-1");
    // The text/html branch must beat the generic text fallback.
    expect(screen.queryByTestId("text-preview")).not.toBeInTheDocument();
  });

  it("renders LoftPlayer for .loft even though file_type is video", () => {
    // .loft is classified as file_type=video for search filtering, but
    // playback must use the iframe-based LoftPlayer (e.g. YouTube embed)
    // — a native <video> can't load a YouTube URL.
    const file = makeFile({
      file_type: "video",
      mime_type: "application/vnd.litloft.loft+json",
      filename: "clip.loft",
    });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("loft-player")).toBeInTheDocument();
    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
  });

  it("renders fallback for unsupported files", () => {
    const file = makeFile({ file_type: "other", mime_type: "application/octet-stream", filename: "data.bin" });
    render(<FilePreview file={file} />);
    expect(screen.getByText("data.bin")).toBeInTheDocument();
    expect(screen.getByText("Preview not available")).toBeInTheDocument();
  });
});
