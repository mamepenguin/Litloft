import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { PassageList } from "../PassageList";
import type { FileItem } from "@/types";

vi.mock("@/components/FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

interface Passage {
  kind:
    | "utterance"
    | "scene"
    | "page"
    | "section"
    | "picture_text"
    | "text"
    | "screen_text";
  start: number | null;
  end: number | null;
  page: number | null;
  section: number | null;
  section_title: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: string | null;
}

interface PassageGroup {
  fileId: string;
  filename: string;
  fileType: string;
  file: FileItem | null;
  bestScore: number;
  passages: Passage[];
}

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    filename: "lecture.mp4",
    title: "lecture",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "/api/files/f1/thumbnail",
    has_thumbnail: true,
    file_size: 0,
    duration: 600,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function passage(overrides: Partial<Passage> = {}): Passage {
  return {
    kind: "text",
    start: null,
    end: null,
    page: null,
    section: null,
    section_title: null,
    chunk_index: null,
    text: "",
    score: 0.5,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
    ...overrides,
  };
}

function group(overrides: Partial<PassageGroup> = {}): PassageGroup {
  return {
    fileId: "f1",
    filename: "lecture.mp4",
    fileType: "video",
    file: file(),
    bestScore: 0.5,
    passages: [
      passage({ kind: "screen_text", start: 12.9, end: 20.0, text: "warehouse on screen" }),
    ],
    ...overrides,
  };
}

const listed = (groups: PassageGroup[]) => (
  <PassageList state="listed" groups={groups} filesCount={1} />
);

describe("SPEC-CORE-048 C2 a video's frame-text passage", () => {
  it("shows the start second, the excerpt and the frame image", () => {
    const frame = "/api/addons/intelligence/files/f1/frame?t=12";
    const { container } = render(
      listed([
        group({
          passages: [
            passage({
              kind: "screen_text",
              start: 12.9,
              end: 20.0,
              chunk_index: 3,
              text: "warehouse on screen",
              frame_url: frame,
            }),
          ],
        }),
      ]),
    );

    const link = screen.getByRole("link", { name: /0:12/ });
    expect(link).toHaveAttribute("href", "/files/f1?t=12");
    expect(link).toHaveTextContent("warehouse on screen");
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", frame);
  });

  it("uses the screen-text label, not the plain-text one", () => {
    render(listed([group()]));

    const link = screen.getByRole("link", { name: /0:12/ });
    expect(link).not.toHaveTextContent("Text");
  });
});
