import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

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
  has_thumbnail: false,
  file_size: 1048576,
  duration: 125.5,
  likes: 3,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
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

  describe("VideoPreview", () => {
    it("renders preview container for video files", () => {
      render(<FileCard file={mockFile} />);
      expect(screen.getByTestId("video-preview-container")).toBeInTheDocument();
    });

    it("does not show preview overlay for image files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "image", mime_type: "image/jpeg", filename: "photo.jpg" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });

    it("does not show preview overlay for audio files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "audio", mime_type: "audio/mpeg", filename: "song.mp3" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });

    it("does not show preview overlay for document files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });
  });

  describe("touch handlers", () => {
    it("forwards onTouchStart when not selectable", () => {
      const onTouchStart = vi.fn();
      render(
        <FileCard
          file={mockFile}
          onTouchStart={onTouchStart}
        />
      );
      const link = screen.getAllByRole("link").find(
        (l) => l.getAttribute("href") === "/files/abc123def456",
      );
      expect(link).toBeTruthy();
      fireEvent.touchStart(link!, { touches: [{ clientX: 10, clientY: 10 }] });
      expect(onTouchStart).toHaveBeenCalledTimes(1);
    });

    it("forwards onTouchEnd when not selectable", () => {
      const onTouchEnd = vi.fn();
      render(
        <FileCard
          file={mockFile}
          onTouchEnd={onTouchEnd}
        />
      );
      const link = screen.getAllByRole("link").find(
        (l) => l.getAttribute("href") === "/files/abc123def456",
      );
      fireEvent.touchEnd(link!);
      expect(onTouchEnd).toHaveBeenCalledTimes(1);
    });

    it("forwards onTouchMove when not selectable", () => {
      const onTouchMove = vi.fn();
      render(
        <FileCard
          file={mockFile}
          onTouchMove={onTouchMove}
        />
      );
      const link = screen.getAllByRole("link").find(
        (l) => l.getAttribute("href") === "/files/abc123def456",
      );
      fireEvent.touchMove(link!, { touches: [{ clientX: 30, clientY: 30 }] });
      expect(onTouchMove).toHaveBeenCalledTimes(1);
    });

    it("does NOT attach touch handlers when selectable", () => {
      const onTouchStart = vi.fn();
      const onTouchEnd = vi.fn();
      const onTouchMove = vi.fn();
      render(
        <FileCard
          file={mockFile}
          selectable
          selected={false}
          onSelect={vi.fn()}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchMove={onTouchMove}
        />
      );
      // selectable mode renders a div with role=button instead of a link
      const button = screen.getByRole("button");
      fireEvent.touchStart(button, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchEnd(button);
      fireEvent.touchMove(button, { touches: [{ clientX: 20, clientY: 20 }] });
      expect(onTouchStart).not.toHaveBeenCalled();
      expect(onTouchEnd).not.toHaveBeenCalled();
      expect(onTouchMove).not.toHaveBeenCalled();
    });
  });

  describe("FileNavigationOverride", () => {
    it("renders <Link> by default (no provider in tree)", () => {
      render(<FileCard file={mockFile} />);
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/files/abc123def456",
      );
    });

    it("absorbs the click and invokes the override when a provider is present", async () => {
      const onNavigate = vi.fn();
      const { FileNavigationOverrideProvider } = await import(
        "@/lib/fileNavigationOverride"
      );
      render(
        <FileNavigationOverrideProvider onNavigate={onNavigate}>
          <FileCard file={mockFile} />
        </FileNavigationOverrideProvider>,
      );
      // With the override, the card renders a <div role="button">
      // instead of a <Link>, so there is no anchor to follow.
      expect(screen.queryByRole("link")).toBeNull();
      fireEvent.click(screen.getByRole("button"));
      expect(onNavigate).toHaveBeenCalledWith("abc123def456");
    });

    it("Cmd/Ctrl-click still escapes to onMetaSelect even with an override", async () => {
      const onNavigate = vi.fn();
      const onMetaSelect = vi.fn();
      const { FileNavigationOverrideProvider } = await import(
        "@/lib/fileNavigationOverride"
      );
      render(
        <FileNavigationOverrideProvider onNavigate={onNavigate}>
          <FileCard file={mockFile} onMetaSelect={onMetaSelect} />
        </FileNavigationOverrideProvider>,
      );
      fireEvent.click(screen.getByRole("button"), { metaKey: true });
      expect(onMetaSelect).toHaveBeenCalledWith("abc123def456");
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("selectable mode wins over the override (selection beats navigation)", async () => {
      const onSelect = vi.fn();
      const onNavigate = vi.fn();
      const { FileNavigationOverrideProvider } = await import(
        "@/lib/fileNavigationOverride"
      );
      render(
        <FileNavigationOverrideProvider onNavigate={onNavigate}>
          <FileCard
            file={mockFile}
            selectable
            selected={false}
            onSelect={onSelect}
          />
        </FileNavigationOverrideProvider>,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onSelect).toHaveBeenCalledWith("abc123def456");
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });
});
