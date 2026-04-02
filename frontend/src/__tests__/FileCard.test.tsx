import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { FileCard } from "../components/FileCard";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  id: "file1",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  file_size: 1024000,
  duration: 120,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

describe("FileCard", () => {
  it("renders file title", () => {
    render(<FileCard file={makeFile()} />);
    expect(screen.getByText("Test Video")).toBeInTheDocument();
  });

  it("does not render progress bar when watchProgress is not provided", () => {
    const { container } = render(<FileCard file={makeFile()} />);
    expect(container.querySelector(".bg-accent")).toBeNull();
  });

  it("renders progress bar when watchProgress is provided", () => {
    const { container } = render(
      <FileCard
        file={makeFile()}
        watchProgress={{ position: 60, duration: 120 }}
      />
    );
    const progressBar = container.querySelector(".bg-accent");
    expect(progressBar).not.toBeNull();
    expect(progressBar?.getAttribute("style")).toContain("width: 50%");
  });

  it("renders correct progress percentage", () => {
    const { container } = render(
      <FileCard
        file={makeFile()}
        watchProgress={{ position: 90, duration: 120 }}
      />
    );
    const progressBar = container.querySelector(".bg-accent");
    expect(progressBar?.getAttribute("style")).toContain("width: 75%");
  });

  it("caps progress at 100%", () => {
    const { container } = render(
      <FileCard
        file={makeFile()}
        watchProgress={{ position: 150, duration: 120 }}
      />
    );
    const progressBar = container.querySelector(".bg-accent");
    expect(progressBar?.getAttribute("style")).toContain("width: 100%");
  });

  it("does not render progress bar when duration is 0", () => {
    const { container } = render(
      <FileCard
        file={makeFile()}
        watchProgress={{ position: 10, duration: 0 }}
      />
    );
    expect(container.querySelector(".bg-accent")).toBeNull();
  });
});
