import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LikeButton } from "@/components/LikeButton";
import { likeFile } from "@/lib/api";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  likeFile: vi.fn(),
}));

const mockLikeFile = vi.mocked(likeFile);

function makeFile(likedAt: string | null): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "f1",
    filename: "clip.mp4",
    title: "Clip",
    description: "",
    drive: "media",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    liked_at: likedAt,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  } as FileItem;
}

describe("LikeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the liked state before the request resolves", async () => {
    let resolve!: (file: FileItem) => void;
    mockLikeFile.mockReturnValue(
      new Promise<FileItem>((r) => {
        resolve = r;
      }),
    );
    const onToggle = vi.fn();
    render(
      <LikeButton fileId="f1" likedAt={null} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as liked" }));

    // Optimistic: the label has already flipped with no response yet.
    expect(
      screen.getByRole("button", { name: "Remove from liked" }),
    ).toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();

    resolve(makeFile("2026-09-01T00:00:00Z"));
    await waitFor(() => expect(onToggle).toHaveBeenCalled());
  });

  it("reverts when the request fails", async () => {
    mockLikeFile.mockRejectedValue(new Error("offline"));
    const onToggle = vi.fn();
    render(
      <LikeButton fileId="f1" likedAt={null} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as liked" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark as liked" }),
      ).toBeInTheDocument(),
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("unlikes a file that carries a stamp", async () => {
    mockLikeFile.mockResolvedValue(makeFile(null));
    const onToggle = vi.fn();
    render(
      <LikeButton
        fileId="f1"
        likedAt="2026-09-01T00:00:00Z"
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove from liked" }));

    await waitFor(() => expect(mockLikeFile).toHaveBeenCalledWith("f1"));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({
      liked_at: null,
    }));
  });

  it("ignores a second click while one is in flight", () => {
    mockLikeFile.mockReturnValue(new Promise<FileItem>(() => {}));
    render(
      <LikeButton fileId="f1" likedAt={null} onToggle={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark as liked" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from liked" }));

    expect(mockLikeFile).toHaveBeenCalledTimes(1);
  });
});
