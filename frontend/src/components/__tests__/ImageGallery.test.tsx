import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ImageGallery } from "../ImageGallery";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn(),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { getDriveFiles } from "@/lib/api";
const mockGetDriveFiles = vi.mocked(getDriveFiles);

function makeImage(id: string, title: string): FileItem {
  return {
    id,
    filename: `${title}.jpg`,
    title,
    description: "",
    drive: "photos",
    folder_path: "vacation",
    file_type: "image",
    mime_type: "image/jpeg",
    thumbnail_url: `/api/files/${id}/thumbnail`,
    file_size: 500000,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-03-20T10:00:00",
    updated_at: "2026-03-20T10:00:00",
  };
}

const images = [
  makeImage("img1", "Photo 1"),
  makeImage("img2", "Photo 2"),
  makeImage("img3", "Photo 3"),
];

const defaultProps = {
  open: true,
  file: images[0],
  onClose: vi.fn(),
};

function setupMock(data: FileItem[] = images) {
  mockGetDriveFiles.mockResolvedValue({
    data,
    meta: { total: data.length, page: 1, limit: 500 },
  });
}

describe("ImageGallery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMock();
    defaultProps.onClose = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <ImageGallery {...defaultProps} open={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows loading spinner initially", () => {
    render(<ImageGallery {...defaultProps} />);
    expect(screen.getByLabelText("閉じる")).toBeInTheDocument();
  });

  it("shows counter after loading", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows image title", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("Photo 1")).toBeInTheDocument();
  });

  it("navigates to next image on right button click", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const nextBtn = screen.getByLabelText("次の画像");
    fireEvent.click(nextBtn);

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("hides prev button on first image", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByLabelText("前の画像")).toBeNull();
    expect(screen.getByLabelText("次の画像")).toBeInTheDocument();
  });

  it("hides next button on last image", async () => {
    render(<ImageGallery {...defaultProps} file={images[2]} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByLabelText("前の画像")).toBeInTheDocument();
    expect(screen.queryByLabelText("次の画像")).toBeNull();
  });

  it("calls onClose on Escape key", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("navigates with arrow keys", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("toggles slideshow with space key", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByLabelText("再生")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByLabelText("一時停止")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByLabelText("再生")).toBeInTheDocument();
  });

  it("calls onClose on close button click", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("hides slideshow controls when only one image", async () => {
    setupMock([images[0]]);
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByLabelText("再生")).toBeNull();
    expect(screen.queryByLabelText("スライドショー間隔")).toBeNull();
  });

  it("shows interval selector", async () => {
    render(<ImageGallery {...defaultProps} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const select = screen.getByLabelText("スライドショー間隔");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("5");
  });
});
