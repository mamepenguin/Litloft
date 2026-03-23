import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VideoCard } from "../VideoCard";
import type { Video } from "@/types";

const mockVideo: Video = {
  id: 1,
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  category: "旅行",
  thumbnail_url: "/api/videos/1/thumbnail",
  file_size: 1048576,
  duration: 125.5,
  likes: 3,
  dislikes: 1,
  is_favorite: false,
  tags: [],
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
};

describe("VideoCard", () => {
  it("renders title", () => {
    render(<VideoCard video={mockVideo} />);
    expect(screen.getByText("Test Video")).toBeInTheDocument();
  });

  it("renders category", () => {
    render(<VideoCard video={mockVideo} />);
    expect(screen.getByText("旅行")).toBeInTheDocument();
  });

  it("renders formatted duration", () => {
    render(<VideoCard video={mockVideo} />);
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("links to video page", () => {
    render(<VideoCard video={mockVideo} />);
    const links = screen.getAllByRole("link");
    const videoLink = links.find((l) => l.getAttribute("href") === "/videos/1");
    expect(videoLink).toBeTruthy();
  });

  it("renders thumbnail image", () => {
    render(<VideoCard video={mockVideo} />);
    const img = screen.getByAltText("Test Video");
    expect(img).toHaveAttribute("src", "/api/videos/1/thumbnail");
  });

  it("handles null duration", () => {
    render(<VideoCard video={{ ...mockVideo, duration: null }} />);
    expect(screen.getByText("--:--")).toBeInTheDocument();
  });
});
