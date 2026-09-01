import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { FileItemWithMatch, MatchMeta } from "@/types";
import { MatchOverlay } from "../MatchOverlay";

function makeFile(overrides: Partial<FileItemWithMatch> = {}): FileItemWithMatch {
  return {
    id: "f1",
    filename: "lecture.mp4",
    title: "Lecture",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 100,
    duration: 600,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    match_meta: {},
    ...overrides,
  };
}

describe("MatchOverlay search snippet", () => {
  it("shows one excerpt for the strongest quotable hit, not one per hit", () => {
    const file = makeFile({
      match_meta: {
        transcript: [
          { time_range: [10, 15], score: 0.9, text: "the strongest passage" },
          { time_range: [20, 25], score: 0.7, text: "a weaker passage" },
          { time_range: [30, 35], score: 0.5, text: "the weakest passage" },
        ],
      },
    });
    render(<MatchOverlay match={file.match_meta!} fileId={file.id} file={file} />);

    expect(screen.getByText("the strongest passage")).toBeInTheDocument();
    expect(screen.queryByText("a weaker passage")).not.toBeInTheDocument();
    expect(screen.queryByText("the weakest passage")).not.toBeInTheDocument();
  });

  it("does not repeat a scene hit that the timestamp pills already show", () => {
    const file = makeFile({
      match_meta: { clip: [{ time_range: [42, 47], score: 0.8 }] },
    });
    render(<MatchOverlay match={file.match_meta!} fileId={file.id} file={file} />);

    // The pill is the only representation of that moment.
    expect(screen.getAllByText("0:42")).toHaveLength(1);
  });

  it("renders badges and pills unchanged when no file is supplied", () => {
    const match: MatchMeta = {
      filename: { score: 1 },
      transcript: [{ time_range: [120, 150], score: 0.7, text: "quotable" }],
    };
    render(<MatchOverlay match={match} fileId="f1" />);

    expect(screen.getByText("2:00")).toBeInTheDocument();
    expect(screen.queryByText("quotable")).not.toBeInTheDocument();
  });

  it("renders nothing when the hit has no badge, pill, page, or snippet", () => {
    const { container } = render(<MatchOverlay match={{}} fileId="f1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
