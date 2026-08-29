import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FileItemWithMatch } from "@/types";
import { MergedResultItem } from "../MergedResultItem";

function makeFile(overrides: Partial<FileItemWithMatch> = {}): FileItemWithMatch {
  return {
    id: "f1",
    filename: "f1.mp4",
    title: "f1",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 100,
    duration: 60,
    likes: 0,
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

describe("MergedResultItem", () => {
  it("filename-only match shows Filename badge and no timestamp pills", () => {
    const file = makeFile({
      id: "f1",
      match_meta: { filename: { score: 1 } },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    expect(screen.getByText("Filename")).toBeInTheDocument();
    expect(screen.queryByText("Transcript")).not.toBeInTheDocument();
    // No "M:SS" formatted time pill in DOM
    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
  });

  it("semantic-only transcript hit at [120, 150] shows Transcript badge + 2:00 timestamp pill", () => {
    const file = makeFile({
      id: "f1",
      match_meta: {
        transcript: [{ time_range: [120, 150], score: 0.7 }],
      },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.queryByText("Filename")).not.toBeInTheDocument();
    // formatDuration(120) → "2:00"
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("combined match (filename + transcript + clip) renders all 3 badges", () => {
    const file = makeFile({
      id: "f1",
      match_meta: {
        filename: { score: 1 },
        transcript: [{ time_range: [10, 20], score: 0.5 }],
        clip: [{ time_range: [30, 40], score: 0.5 }],
      },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    expect(screen.getByText("Filename")).toBeInTheDocument();
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.getByText("Visual")).toBeInTheDocument();
  });

  it("path-only match shows Path badge but not ファイル名 badge", () => {
    const file = makeFile({
      id: "f1",
      match_meta: { path: { score: 1 } },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    expect(screen.getByText("Path")).toBeInTheDocument();
    expect(screen.queryByText("Filename")).not.toBeInTheDocument();
  });

  it("clicking the row fires onSelect with /files/{id}", () => {
    const file = makeFile({ id: "abc" });
    const onSelect = vi.fn();
    const { container } = render(
      <MergedResultItem file={file} onSelect={onSelect} />,
    );

    // The row is the outermost interactive container.
    const row = container.querySelector(
      '[data-testid="merged-result-item"]',
    ) as HTMLElement | null;
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(onSelect).toHaveBeenCalledWith("/files/abc");
  });

  it("clicking a timestamp pill fires onSelect with ?t=120 and stops row propagation", () => {
    const file = makeFile({
      id: "abc",
      match_meta: {
        transcript: [{ time_range: [120, 150], score: 0.7 }],
      },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    const pill = screen.getByText("2:00");
    fireEvent.click(pill);

    // Pill click should fire exactly once with the t-stamped URL — not
    // twice (which would mean the row click also fired due to bubbling).
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("/files/abc?t=120");
  });

  it("does NOT render pills for placeholder time_range entries [-1, -1]", () => {
    // buildMatchMeta uses [-1, -1] as a synthetic time_range when it
    // wants the audio badge to render but has no real timestamp.
    const file = makeFile({
      id: "f1",
      match_meta: {
        transcript: [{ time_range: [-1, -1], score: 0.7 }],
      },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    // Badge visible, pill suppressed.
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.queryByText(/^-?\d+:\d{2}$/)).not.toBeInTheDocument();
  });

  it("renders at most 5 timestamp pills even when more are present", () => {
    const file = makeFile({
      id: "f1",
      match_meta: {
        transcript: [
          { time_range: [10, 11], score: 0.5 },
          { time_range: [20, 21], score: 0.5 },
          { time_range: [30, 31], score: 0.5 },
          { time_range: [40, 41], score: 0.5 },
          { time_range: [50, 51], score: 0.5 },
          { time_range: [60, 61], score: 0.5 },
          { time_range: [70, 71], score: 0.5 },
        ],
      },
    });
    const onSelect = vi.fn();
    render(<MergedResultItem file={file} onSelect={onSelect} />);

    const pills = screen.getAllByText(/^\d+:\d{2}$/);
    expect(pills.length).toBeLessThanOrEqual(5);
  });

  it("stays navigation-only: no snippet or capture action in the dropdown", () => {
    // The dropdown is driven by arrow keys + Enter. Search snippets and
    // capture actions live on the results page / file list instead, so a
    // row stays one focusable target and the selection highlight stays
    // the height of a row.
    const file = makeFile({
      match_meta: {
        transcript: [{
          time_range: [10, 20],
          score: 0.8,
          text: "quotable source excerpt",
        }],
      },
    });
    render(<MergedResultItem file={file} onSelect={vi.fn()} />);

    expect(screen.queryByText("quotable source excerpt")).not.toBeInTheDocument();
    expect(screen.getByTestId("merged-result-item").tagName).toBe("BUTTON");
  });
});
