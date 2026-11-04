import { describe, expect, it } from "vitest";

import {
  groupPassages,
  highlightSegments,
  passageCounts,
  passageHref,
  passageLocator,
} from "../searchPassages";
import type { SemanticHit } from "../searchMerge";

/**
 * The wire shape `/search?passages=true` gives each entry of `passages`
 * (SPEC-ADDON-048 step 6). Written here rather than imported so a test can
 * build one without depending on where core declares the type.
 */
interface Passage {
  kind: "utterance" | "scene" | "page" | "section" | "picture_text" | "text";
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
    score: 0,
    keyword: false,
    highlight_terms: [],
    frame_url: null,
    ...overrides,
  };
}

function hit(
  fileId: string,
  passages: Passage[] | undefined,
  overrides: Partial<SemanticHit> = {},
): SemanticHit {
  const base: SemanticHit = {
    file_id: fileId,
    drive: "main",
    filename: `${fileId}.mp4`,
    file_type: "video",
    score: 0.5,
    match_types: [],
    segments: [],
    file: null,
    ...overrides,
  };
  return passages === undefined ? base : { ...base, passages };
}

describe("SPEC-CORE-040 I10 grouping passages by file", () => {
  it("orders groups by their first passage's score", () => {
    const groups = groupPassages([
      hit("a", [passage({ score: 0.6 }), passage({ score: 0.4 })]),
      hit("b", [passage({ score: 0.9 })]),
      hit("c", [passage({ score: 0.75 })]),
    ]);

    expect(groups.map((g) => g.fileId)).toEqual(["b", "c", "a"]);
    expect(groups.map((g) => g.bestScore)).toEqual([0.9, 0.75, 0.6]);
  });

  it("breaks a tie in best score by the hit's position in the answer", () => {
    const groups = groupPassages([
      hit("first", [passage({ score: 0.8 })]),
      hit("second", [passage({ score: 0.8 })]),
      hit("third", [passage({ score: 0.8 })]),
    ]);

    expect(groups.map((g) => g.fileId)).toEqual(["first", "second", "third"]);
  });

  it("keeps every passage of a file in the addon's order", () => {
    const passages = [
      passage({ score: 0.9, text: "one" }),
      passage({ score: 0.7, text: "two" }),
      passage({ score: 0.5, text: "three" }),
      passage({ score: 0.3, text: "four" }),
    ];

    const [group] = groupPassages([hit("a", passages)]);

    expect(group.passages.map((p) => p.text)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("omits a hit the answer gave no passages, with or without the key", () => {
    const groups = groupPassages([
      hit("none", []),
      hit("older-addon", undefined),
      hit("list", [passage({ score: 0.2 })]),
    ]);

    expect(groups.map((g) => g.fileId)).toEqual(["list"]);
    expect(passageCounts(groups)).toEqual({ files: 1, passages: 1 });
  });

  it("names the file from the hydrated file, else the hit", () => {
    const hydrated = hit("a", [passage()], {
      filename: "hit-name.mp4",
      file: {
        id: "a",
        filename: "hydrated-name.mp4",
        title: "hydrated-name",
        description: "",
        drive: "main",
        folder_path: "",
        file_type: "video",
        mime_type: "video/mp4",
        thumbnail_url: "",
        has_thumbnail: false,
        file_size: 0,
        duration: 60,
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
      },
    });

    expect(groupPassages([hydrated])[0].filename).toBe("hydrated-name.mp4");
    expect(groupPassages([hit("b", [passage()])])[0].filename).toBe("b.mp4");
  });

  it("counts every passage of every group, the hidden ones included", () => {
    const groups = groupPassages([
      hit("a", [1, 2, 3, 4, 5].map((n) => passage({ score: n / 10 }))),
      hit("b", [passage({ score: 0.2 })]),
    ]);

    expect(passageCounts(groups)).toEqual({ files: 2, passages: 6 });
  });

  it("counts an empty answer as zero files and zero passages", () => {
    expect(passageCounts(groupPassages([]))).toEqual({ files: 0, passages: 0 });
  });
});

describe("SPEC-CORE-040 I23 the locator each kind shows", () => {
  const rows: Array<[string, Passage, ReturnType<typeof passageLocator>]> = [
    [
      "an utterance shows its time range",
      passage({ kind: "utterance", start: 120.4, end: 150.9 }),
      { kind: "timeRange", start: 120.4, end: 150.9 },
    ],
    [
      "a scene shows its start time only",
      passage({ kind: "scene", start: 30.5, end: 60.5 }),
      { kind: "timeStartOnly", start: 30.5 },
    ],
    [
      "a page shows its number",
      passage({ kind: "page", page: 7 }),
      { kind: "page", page: 7 },
    ],
    [
      "a section shows its title",
      passage({ kind: "section", section: 3, section_title: "予算" }),
      { kind: "section", section: 3, title: "予算" },
    ],
    [
      "a section without a title keeps its number",
      passage({ kind: "section", section: 3, section_title: null }),
      { kind: "section", section: 3, title: null },
    ],
    [
      "picture text names itself",
      passage({ kind: "picture_text" }),
      { kind: "pictureText" },
    ],
    ["plain text names itself", passage({ kind: "text" }), { kind: "text" }],
  ];

  it.each(rows)("%s", (_name, p, expected) => {
    expect(passageLocator(p)).toEqual(expected);
  });
});

describe("SPEC-CORE-040 I11 where a row opens its file", () => {
  const rows: Array<[string, Passage, string]> = [
    [
      "an utterance opens at its floored start time",
      passage({ kind: "utterance", start: 120.9, end: 150 }),
      "/files/f1?t=120",
    ],
    [
      "a scene opens at its floored start time",
      passage({ kind: "scene", start: 30.2 }),
      "/files/f1?t=30",
    ],
    [
      "a page opens at its page",
      passage({ kind: "page", page: 7 }),
      "/files/f1?page=7",
    ],
    [
      "a section opens at its section",
      passage({ kind: "section", section: 3, section_title: "予算" }),
      "/files/f1?section=3",
    ],
    [
      "picture text opens the file at its start",
      passage({ kind: "picture_text" }),
      "/files/f1",
    ],
    ["plain text opens the file at its start", passage({ kind: "text" }), "/files/f1"],
  ];

  it.each(rows)("%s", (_name, p, href) => {
    expect(passageHref("f1", p)).toBe(href);
  });
});

describe("SPEC-CORE-040 I12 marking the terms a keyword search matched", () => {
  const rows: Array<[string, string, string[], Array<{ text: string; mark: boolean }>]> = [
    [
      "every occurrence, whatever its case",
      "Cats and CATS",
      ["cats"],
      [
        { text: "Cats", mark: true },
        { text: " and ", mark: false },
        { text: "CATS", mark: true },
      ],
    ],
    [
      "the longer term where two overlap",
      "ababa",
      ["aba", "abab"],
      [
        { text: "abab", mark: true },
        { text: "a", mark: false },
      ],
    ],
    [
      "the earlier occurrence between terms of the same length",
      "aba",
      ["ab", "ba"],
      [
        { text: "ab", mark: true },
        { text: "a", mark: false },
      ],
    ],
    [
      "no nesting inside an already marked term",
      "倉庫の移転",
      ["倉庫", "庫の"],
      [
        { text: "倉庫", mark: true },
        { text: "の移転", mark: false },
      ],
    ],
    [
      "each Japanese term of the query",
      "倉庫の移転費用",
      ["倉庫", "移転"],
      [
        { text: "倉庫", mark: true },
        { text: "の", mark: false },
        { text: "移転", mark: true },
        { text: "費用", mark: false },
      ],
    ],
    [
      "nothing when no term is given",
      "no terms here",
      [],
      [{ text: "no terms here", mark: false }],
    ],
  ];

  it.each(rows)("marks %s", (_name, text, terms, expected) => {
    expect(highlightSegments(text, terms)).toEqual(expected);
  });

  it("has nothing to mark in an empty excerpt", () => {
    expect(highlightSegments("", ["cats"])).toEqual([]);
  });
});
