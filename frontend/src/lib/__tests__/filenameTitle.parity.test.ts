import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { filenameToTitle } from "@/lib/filenameTitle";

/**
 * The frontend's `filenameToTitle` against the table the backend's
 * `_filename_to_title` is measured on, in
 * `backend/tests/test_filename_title_parity.py`.
 *
 * Two implementations, one table. Neither side can call the other, so the
 * only thing that can catch a drift is a case list that both read — and it
 * has to be the *same* file, not two copies, or the drift moves into the
 * fixtures.
 */
const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/tests/fixtures/filename_title.json",
);

interface Case {
  filename: string;
  title: string;
}

const cases: Case[] = JSON.parse(readFileSync(FIXTURE, "utf-8")).cases;

describe("filenameToTitle agrees with the backend", () => {
  it("reads the whole table, not some of it", () => {
    // "Every case agrees" is also true of no cases, and this file resolves
    // a path across the repo — a rename would otherwise leave it green.
    //
    // Exact, not a floor: under `>=` deleting the cases that cost the most
    // to keep passing — the scripts, the apostrophe, the interior capital —
    // halves the coverage both suites are built on and neither says
    // anything. The number is also written down on the Python side, so a
    // deletion is a two-file edit, which is what makes someone look.
    expect(cases.length).toBe(26);
  });

  it.each(cases.map((c) => [c.filename, c.title] as const))(
    "%s → %s",
    (filename, title) => {
      expect(filenameToTitle(filename)).toBe(title);
    },
  );
});
