import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { FileCard } from "../components/FileCard";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id: "file1",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024000,
  duration: 120,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

describe("FileCard", () => {
  it("keeps the title as the card's accessible name", () => {
    // The title stopped being an `<h3>` (D-5), and dropping the tag must
    // not drop the name: what a screen reader navigates a listing by is
    // the link's name, so that is what is asserted rather than the text
    // being present somewhere on the card.
    render(<FileCard file={makeFile()} />);
    expect(
      screen.getByRole("link", { name: /Test Video/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

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
