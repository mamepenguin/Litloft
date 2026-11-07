import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFileFind, type FindRow } from "@/lib/fileFind";

const TERM = "needle";

const VALID_QUAD = [0.1, 0.2, 0.4, 0.2, 0.4, 0.3, 0.1, 0.3];
const OTHER_QUAD = [0.5, 0.5, 0.7, 0.5, 0.7, 0.6, 0.5, 0.6];

function isQuad(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function answerWith(boxes: unknown) {
  return {
    query: TERM,
    indexed: true,
    total: 2,
    truncated: false,
    rows: [
      {
        kind: "picture_text",
        ordinal: 1,
        snippet: `alpha ${TERM} bravo`,
        match_start: "alpha ".length,
        match_length: TERM.length,
        boxes,
      },
      {
        kind: "text",
        ordinal: 2,
        snippet: `charlie ${TERM} delta`,
        match_start: "charlie ".length,
        match_length: TERM.length,
      },
    ],
  };
}

type RowWithBoxes = FindRow & { boxes?: number[][] | null };

async function readRow(boxes: unknown): Promise<RowWithBoxes> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => answerWith(boxes),
    })),
  );
  const result = await fetchFileFind("f1", TERM, "drive");
  if (result.kind !== "answer") throw new Error(`unexpected ${result.kind}`);
  return result.answer.rows[0];
}

/** A row is allowed to keep only the usable quads, or none at all. */
function usableQuads(row: RowWithBoxes): number[][] {
  if (row.boxes === undefined || row.boxes === null) return [];
  expect(Array.isArray(row.boxes)).toBe(true);
  expect(row.boxes.every(isQuad)).toBe(true);
  return row.boxes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-051 I9 picture_text boxes are read from the find answer", () => {
  it("keeps valid boxes on a picture_text row and leaves the row in place", async () => {
    const row = await readRow([VALID_QUAD, OTHER_QUAD]);

    expect(row.kind).toBe("picture_text");
    expect(row.ordinal).toBe(1);
    expect(row.snippet).toBe(`alpha ${TERM} bravo`);
    expect(row.boxes).toEqual([VALID_QUAD, OTHER_QUAD]);
  });

  it.each([
    { name: "missing", boxes: undefined, survivors: 0 },
    { name: "null", boxes: null, survivors: 0 },
    { name: "a string", boxes: "0.1,0.2", survivors: 0 },
    { name: "an object", boxes: { 0: VALID_QUAD }, survivors: 0 },
    { name: "a number", boxes: 1, survivors: 0 },
    { name: "a flat list of numbers", boxes: VALID_QUAD, survivors: 0 },
    {
      name: "an inner list of seven numbers",
      boxes: [[0.1, 0.2, 0.4, 0.2, 0.4, 0.3, 0.1]],
      survivors: 0,
    },
    {
      name: "an inner list of nine numbers",
      boxes: [[...VALID_QUAD, 0]],
      survivors: 0,
    },
    {
      name: "a non-finite number",
      boxes: [[...VALID_QUAD.slice(0, 7), Infinity]],
      survivors: 0,
    },
    {
      name: "a non-numeric corner",
      boxes: [[...VALID_QUAD.slice(0, 7), "0.3"]],
      survivors: 0,
    },
    {
      name: "a valid quad beside a malformed one",
      boxes: [VALID_QUAD, [0.1, 0.2, 0.4]],
      survivors: 1,
    },
    {
      name: "a valid quad beside a non-finite one",
      boxes: [VALID_QUAD, [0.1, 0.2, 0.4, 0.2, 0.4, 0.3, 0.1, NaN]],
      survivors: 1,
    },
  ])(
    "reads $name as no usable quad and keeps the row in place",
    async ({ boxes, survivors }) => {
      const row = await readRow(boxes);

      expect(row.kind).toBe("picture_text");
      expect(row.ordinal).toBe(1);
      expect(row.snippet).toBe(`alpha ${TERM} bravo`);
      const quads = usableQuads(row);
      expect(quads.length).toBeLessThanOrEqual(survivors);
      if (survivors === 0) expect(quads).toHaveLength(0);
      for (const quad of quads) expect(quad).toEqual(VALID_QUAD);
    },
  );

  it("keeps the picture row's place before and after a text row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => answerWith([VALID_QUAD]),
      })),
    );
    const result = await fetchFileFind("f1", TERM, "drive");
    if (result.kind !== "answer") throw new Error(`unexpected ${result.kind}`);

    expect(result.answer.rows.map((row) => row.kind)).toEqual([
      "picture_text",
      "text",
    ]);
    expect(result.answer.total).toBe(2);
  });
});
