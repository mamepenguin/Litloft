import { describe, expect, it } from "vitest";
import type { FileItem } from "@/types";
import {
  buildMatchMeta,
  computeHybridScore,
  mergeResults,
  sortMerged,
  type SemanticHit,
} from "../searchMerge";

function makeFile(overrides: Partial<FileItem>): FileItem {
  return {
    id: "f1",
    filename: "f1.mp4",
    title: "f1",
    description: "",
    drive: "test",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1000,
    duration: 60,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHit(overrides: Partial<SemanticHit>): SemanticHit {
  return {
    file_id: "f1",
    drive: "test",
    filename: "f1.mp4",
    file_type: "video",
    score: 0.8,
    match_types: ["transcript"],
    segments: [],
    file: null,
    ...overrides,
  };
}

describe("buildMatchMeta", () => {
  it("collects transcript timestamps", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["transcript"],
        segments: [
          {
            time_range: [10, 20],
            matches: [{ type: "transcript", score: 0.7, text: "hi" }],
          },
          {
            time_range: [30, 40],
            matches: [{ type: "transcript", score: 0.6 }],
          },
        ],
      }),
    );
    expect(meta.transcript).toHaveLength(2);
    expect(meta.transcript?.[0].time_range).toEqual([10, 20]);
    expect(meta.transcript?.[0].text).toBe("hi");
  });

  it("merges metadata score by max", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["metadata"],
        segments: [
          {
            time_range: null,
            matches: [
              { type: "metadata", score: 0.5 },
              { type: "metadata", score: 0.8 },
            ],
          },
        ],
      }),
    );
    expect(meta.metadata?.score).toBe(0.8);
  });

  it("collects unique sorted page numbers", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["content"],
        segments: [
          {
            time_range: null,
            matches: [
              { type: "content", score: 0.4, page: 5 },
              { type: "content", score: 0.6, page: 2 },
              { type: "content", score: 0.5, page: 5 },
            ],
          },
        ],
      }),
    );
    expect(meta.matched_pages).toEqual([2, 5]);
  });

  it("collects clip_thumbnail score (no timestamp)", () => {
    // Spec 2026-05-02-thumbnail-clip-default-shallow-search.md:
    // representative-frame CLIP carries no time_range — surface as a
    // score-only field distinct from the time-ranged ``clip`` array.
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["clip_thumbnail"],
        segments: [
          {
            time_range: null,
            matches: [{ type: "clip_thumbnail", score: 0.42 }],
          },
        ],
      }),
    );
    expect(meta.clip_thumbnail?.score).toBe(0.42);
    expect(meta.clip).toBeUndefined();
  });

  it("uses max score across multiple clip_thumbnail hits", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["clip_thumbnail"],
        segments: [
          {
            time_range: null,
            matches: [
              { type: "clip_thumbnail", score: 0.3 },
              { type: "clip_thumbnail", score: 0.7 },
            ],
          },
        ],
      }),
    );
    expect(meta.clip_thumbnail?.score).toBe(0.7);
  });

  it("falls back to a placeholder transcript entry when match_types declares audio but no segment has a usable time_range", () => {
    // Without the fallback the badge row would be empty even though
    // intelligence reported a transcript hit. Using time_range=[-1,-1]
    // surfaces the badge while the timestamp-pill renderer skips it.
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["transcript"],
        segments: [
          {
            time_range: null,
            matches: [{ type: "transcript", score: 0.7 }],
          },
        ],
      }),
    );
    expect(meta.transcript).toHaveLength(1);
    expect(meta.transcript?.[0].time_range[0]).toBe(-1);
  });

  it("recognises whisper as audio (real backend embedding_type)", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["whisper"],
        segments: [
          {
            time_range: [5, 9],
            matches: [{ type: "whisper", score: 0.6, text: "ok" }],
          },
        ],
      }),
    );
    expect(meta.transcript?.[0].time_range).toEqual([5, 9]);
  });

  it("folds text_content (semantic) and text_content_keyword into content", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["text_content", "text_content_keyword"],
        segments: [
          {
            time_range: null,
            matches: [
              { type: "text_content", score: 0.4 },
              { type: "text_content_keyword", score: 0.7 },
            ],
          },
        ],
      }),
    );
    expect(meta.content?.score).toBe(0.7);
  });

  it("synthesises a filename badge for keyword-only semantic hits", () => {
    const meta = buildMatchMeta(
      makeHit({
        match_types: ["keyword"],
        score: 0.5,
        segments: [],
      }),
    );
    expect(meta.filename?.score).toBe(0.5);
  });
});

describe("computeHybridScore", () => {
  it("boosts filename matches", () => {
    const score = computeHybridScore({ filename: { score: 1 } });
    expect(score).toBe(2);
  });

  it("uses max of transcript scores", () => {
    const score = computeHybridScore({
      transcript: [
        { time_range: [0, 1], score: 0.3 },
        { time_range: [2, 3], score: 0.9 },
      ],
    });
    expect(score).toBeCloseTo(0.9);
  });

  it("stacks multiple engines", () => {
    const score = computeHybridScore({
      filename: { score: 1 },
      transcript: [{ time_range: [0, 1], score: 0.5 }],
      clip: [{ time_range: [0, 1], score: 0.5 }],
    });
    // 1*2 + 0.5 + 0.5*0.8 = 2 + 0.5 + 0.4 = 2.9
    expect(score).toBeCloseTo(2.9);
  });

  it("includes clip_thumbnail with the same visual-channel weight", () => {
    const score = computeHybridScore({
      clip_thumbnail: { score: 0.5 },
    });
    expect(score).toBeCloseTo(0.5 * 0.8);
  });

  it("adds path match with low weight (0.3)", () => {
    // spec 2026-05-02-search-path-match: path-only hits use a lower weight
    // (0.3) than filename×2.0 / metadata×1.0 to suppress noise.
    const score = computeHybridScore({ path: { score: 1 } });
    expect(score).toBeCloseTo(0.3);
  });

  it("stacks filename and path when both engines hit", () => {
    const score = computeHybridScore({
      filename: { score: 1 },
      path: { score: 1 },
    });
    // 1*2.0 + 1*0.3 = 2.3
    expect(score).toBeCloseTo(2.3);
  });
});

describe("mergeResults", () => {
  it("dedups files that appear in both engines", () => {
    const filenameFile = makeFile({ id: "f1" });
    const semanticHit = makeHit({
      file_id: "f1",
      match_types: ["transcript"],
      segments: [
        {
          time_range: [10, 20],
          matches: [{ type: "transcript", score: 0.7 }],
        },
      ],
    });
    const { files, total } = mergeResults({
      filenameMatches: [filenameFile],
      semanticHits: [semanticHit],
      filenameTotal: 1,
    });
    expect(files).toHaveLength(1);
    expect(files[0].match_meta?.filename).toEqual({ score: 1 });
    expect(files[0].match_meta?.transcript).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("appends semantic-only files", () => {
    const filenameFile = makeFile({ id: "f1" });
    const semanticHit = makeHit({
      file_id: "f2",
      filename: "f2.mp4",
      match_types: ["transcript"],
      segments: [
        {
          time_range: [10, 20],
          matches: [{ type: "transcript", score: 0.7 }],
        },
      ],
    });
    const { files, total } = mergeResults({
      filenameMatches: [filenameFile],
      semanticHits: [semanticHit],
      filenameTotal: 1,
    });
    expect(files.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
    expect(total).toBe(2);
  });

  it("uses hydrated FileItem when available", () => {
    const hydrated = makeFile({ id: "f9", title: "hydrated", file_size: 4242 });
    const semanticHit = makeHit({ file_id: "f9", file: hydrated });
    const { files } = mergeResults({
      filenameMatches: [],
      semanticHits: [semanticHit],
      filenameTotal: 0,
    });
    expect(files[0].title).toBe("hydrated");
    expect(files[0].file_size).toBe(4242);
  });

  it("falls back to snapshot when hydrate failed", () => {
    const semanticHit = makeHit({
      file_id: "f9",
      filename: "snap.mp4",
      file: null,
    });
    const { files } = mergeResults({
      filenameMatches: [],
      semanticHits: [semanticHit],
      filenameTotal: 0,
    });
    expect(files[0].id).toBe("f9");
    expect(files[0].filename).toBe("snap.mp4");
    expect(files[0].file_size).toBe(0);
  });

  it("sets match_meta.path when filename API reports match_source=path", () => {
    // spec 2026-05-02-search-path-match: files where backend returns
    // match_source="path" are classified with the path badge, not filename.
    const f = makeFile({ id: "p1", match_source: "path" });
    const { files } = mergeResults({
      filenameMatches: [f],
      semanticHits: [],
      filenameTotal: 1,
    });
    expect(files[0].match_meta?.path).toEqual({ score: 1 });
    expect(files[0].match_meta?.filename).toBeUndefined();
  });

  it("sets both filename and path when match_source=both", () => {
    const f = makeFile({ id: "p2", match_source: "both" });
    const { files } = mergeResults({
      filenameMatches: [f],
      semanticHits: [],
      filenameTotal: 1,
    });
    expect(files[0].match_meta?.filename).toEqual({ score: 1 });
    expect(files[0].match_meta?.path).toEqual({ score: 1 });
    // 1*2.0 + 1*0.3 = 2.3
    expect(files[0].match_score).toBeCloseTo(2.3);
  });

  it("treats missing match_source as filename (backwards compat)", () => {
    const f = makeFile({ id: "p3" });
    const { files } = mergeResults({
      filenameMatches: [f],
      semanticHits: [],
      filenameTotal: 1,
    });
    expect(files[0].match_meta?.filename).toEqual({ score: 1 });
    expect(files[0].match_meta?.path).toBeUndefined();
  });

  it("computes match_score for sorting", () => {
    const filenameFile = makeFile({ id: "f1" });
    const semanticHit = makeHit({
      file_id: "f1",
      match_types: ["transcript"],
      segments: [
        {
          time_range: [10, 20],
          matches: [{ type: "transcript", score: 0.7 }],
        },
      ],
    });
    const { files } = mergeResults({
      filenameMatches: [filenameFile],
      semanticHits: [semanticHit],
      filenameTotal: 1,
    });
    // filename(1)*2 + transcript max(0.7) = 2.7
    expect(files[0].match_score).toBeCloseTo(2.7);
  });
});

describe("sortMerged", () => {
  it("sorts by relevance desc", () => {
    const files = [
      { ...makeFile({ id: "a" }), match_score: 1 },
      { ...makeFile({ id: "b" }), match_score: 5 },
      { ...makeFile({ id: "c" }), match_score: 3 },
    ];
    const sorted = sortMerged(files, "relevance", "desc");
    expect(sorted.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by created_at desc", () => {
    const files = [
      { ...makeFile({ id: "a", created_at: "2026-01-01T00:00:00Z" }) },
      { ...makeFile({ id: "b", created_at: "2026-03-01T00:00:00Z" }) },
      { ...makeFile({ id: "c", created_at: "2026-02-01T00:00:00Z" }) },
    ];
    const sorted = sortMerged(files, "created_at", "desc");
    expect(sorted.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by file_size asc", () => {
    const files = [
      { ...makeFile({ id: "a", file_size: 300 }) },
      { ...makeFile({ id: "b", file_size: 100 }) },
      { ...makeFile({ id: "c", file_size: 200 }) },
    ];
    const sorted = sortMerged(files, "file_size", "asc");
    expect(sorted.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });
});
