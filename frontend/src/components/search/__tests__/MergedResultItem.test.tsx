import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FileItemWithMatch } from "@/types";
import { MergedResultItem } from "../MergedResultItem";

function makeFile(overrides: Partial<FileItemWithMatch> = {}): FileItemWithMatch {
  return {
    image_width: null,
    image_height: null,
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

  it("renders three timestamp pills and counts the rest", () => {
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

    // Enumerated, not counted: a `<=` bound holds at every cap from zero
    // to the bound.
    expect(screen.getAllByText(/^\d+:\d{2}$/).map((p) => p.textContent)).toEqual([
      "0:10",
      "0:20",
      "0:30",
    ]);
    expect(screen.getByText("+4")).toBeInTheDocument();
  });

  /**
   * S-1. `file.title` is the backend's `_filename_to_title`: the filename
   * with its extension dropped and underscores turned into spaces, so the
   * filename under the title usually repeats it with ".mp4" glued on. The
   * line draws only when it has something else to say.
   */
  describe("the second line", () => {
    it("is absent when the filename is the title plus an extension", () => {
      const { container } = render(
        <MergedResultItem
          file={makeFile({ filename: "kyoto.mp4", title: "kyoto", folder_path: "" })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.queryByText(/kyoto\.mp4/)).not.toBeInTheDocument();
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("is absent when the title is the raw filename", () => {
      // A semantic-only hit has no file record behind it, so
      // `mergeResults` titles the row with the filename verbatim
      // (`searchMerge.ts` `title: hit.filename`). Comparing only against
      // the stem would print ".mp4"'s row twice.
      const { container } = render(
        <MergedResultItem
          file={makeFile({ filename: "clip.mp4", title: "clip.mp4", folder_path: "" })}
          onSelect={vi.fn()}
        />,
      );
      // By text, not by element count: rendering the line as a `<div>`
      // would keep the `<p>` count at one and put the name back on screen.
      expect(screen.queryAllByText("clip.mp4")).toHaveLength(1);
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("is the folder path alone when that is the only new fact", () => {
      render(
        <MergedResultItem
          file={makeFile({
            filename: "kyoto.mp4",
            title: "kyoto",
            folder_path: "travel/2026",
          })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.getByText("travel/2026/")).toBeInTheDocument();
      expect(screen.queryByText(/kyoto\.mp4/)).not.toBeInTheDocument();
    });

    it("keeps the filename when the title is not just the stem", () => {
      // The backend also turns underscores into spaces, so a title can
      // differ from the stem by more than an extension.
      render(
        <MergedResultItem
          file={makeFile({
            filename: "kyoto_day_1.mp4",
            title: "kyoto day 1",
            folder_path: "travel/2026",
          })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.getByText("travel/2026/kyoto_day_1.mp4")).toBeInTheDocument();
    });

    it("keeps the filename with no folder to prefix it", () => {
      render(
        <MergedResultItem
          file={makeFile({
            filename: "renamed.mp4",
            title: "Something Else",
            folder_path: "",
          })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.getByText("renamed.mp4")).toBeInTheDocument();
    });

    it("drops only the last extension of a double one", () => {
      // `archive.tar.gz` titles as `archive.tar`, so the stem matches and
      // the line has nothing to add.
      const { container } = render(
        <MergedResultItem
          file={makeFile({
            filename: "archive.tar.gz",
            title: "archive.tar",
            folder_path: "",
          })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.queryByText("archive.tar.gz")).toBeNull();
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("keeps a name with no extension at all", () => {
      const { container } = render(
        <MergedResultItem
          file={makeFile({ filename: "README", title: "README", folder_path: "" })}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.queryAllByText("README")).toHaveLength(1);
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });
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
