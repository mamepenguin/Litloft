import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchiveImageViewer } from "../ArchiveImageViewer";
import type { ArchiveEntry } from "@/types";

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

function makeImage(path: string): ArchiveEntry {
  return {
    path,
    filename: path.split("/").pop()!,
    file_size: 100,
    compressed_size: 50,
    file_type: "image",
    mime_type: "image/jpeg",
    is_dir: false,
  };
}

const images = [makeImage("img1.jpg"), makeImage("img2.jpg"), makeImage("img3.jpg")];

const defaultProps = {
  fileId: "file-1",
  currentImage: images[1],
  imageEntries: images,
  imageIndex: 1,
  imageLoading: false,
  setImageLoading: vi.fn(),
  playing: false,
  setPlaying: vi.fn(),
  slideshowInterval: 5,
  setSlideshowInterval: vi.fn(),
  showControls: true,
  handleImageAreaClick: vi.fn(),
  closeViewer: vi.fn(),
  splitMode: false,
  setSplitMode: vi.fn(),
  readingDirection: "ltr" as const,
  setReadingDirection: vi.fn(),
  isCurrentLandscape: false,
  setIsCurrentLandscape: vi.fn(),
  showRightHalf: false,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};

describe("ArchiveImageViewer", () => {
  it("renders current image", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    const img = screen.getByAltText("img2.jpg");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "/api/files/file-1/archive/entry?path=img2.jpg"
    );
  });

  it("shows filename and counter", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByText("img2.jpg")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("shows prev and next buttons when controls visible", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("前の画像")).toBeInTheDocument();
    expect(screen.getByLabelText("次の画像")).toBeInTheDocument();
  });

  it("hides prev button at first image", () => {
    render(<ArchiveImageViewer {...defaultProps} imageIndex={0} currentImage={images[0]} />);
    expect(screen.queryByLabelText("前の画像")).not.toBeInTheDocument();
    expect(screen.getByLabelText("次の画像")).toBeInTheDocument();
  });

  it("hides next button at last image", () => {
    render(<ArchiveImageViewer {...defaultProps} imageIndex={2} currentImage={images[2]} />);
    expect(screen.getByLabelText("前の画像")).toBeInTheDocument();
    expect(screen.queryByLabelText("次の画像")).not.toBeInTheDocument();
  });

  it("hides navigation when controls are hidden", () => {
    render(<ArchiveImageViewer {...defaultProps} showControls={false} />);
    expect(screen.queryByLabelText("前の画像")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("次の画像")).not.toBeInTheDocument();
  });

  it("calls closeViewer on close button click", () => {
    const closeViewer = vi.fn();
    render(<ArchiveImageViewer {...defaultProps} closeViewer={closeViewer} />);
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(closeViewer).toHaveBeenCalled();
  });

  it("renders download link with correct href", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    const link = screen.getByLabelText("ダウンロード");
    expect(link).toHaveAttribute(
      "href",
      "/api/files/file-1/archive/entry?path=img2.jpg"
    );
    expect(link).toHaveAttribute("download", "img2.jpg");
  });

  it("shows play/pause button for multiple images", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("再生")).toBeInTheDocument();
  });

  it("shows pause label when playing", () => {
    render(<ArchiveImageViewer {...defaultProps} playing={true} />);
    expect(screen.getByLabelText("一時停止")).toBeInTheDocument();
  });

  it("shows loading spinner when imageLoading is true", () => {
    const { container } = render(
      <ArchiveImageViewer {...defaultProps} imageLoading={true} />
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders slideshow interval selector", () => {
    render(<ArchiveImageViewer {...defaultProps} />);
    expect(screen.getByLabelText("スライドショー間隔")).toBeInTheDocument();
  });
});
