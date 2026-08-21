/**
 * Frontend half of the filename-validation parity contract.
 *
 * The inline rename editor rejects bad names locally so the user sees the
 * problem without a round-trip, but `fileops.validate_filename` stays
 * authoritative. Two implementations of one rule drift in silence, so
 * both sides read the same table and one of the two suites fails as soon
 * as they disagree.
 *
 * The backend half is
 * `backend/tests/test_filename_validation_parity.py`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateFilename } from "../filename";

interface Case {
  name: string;
  repeat?: number;
  valid: boolean;
  why: string;
}

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/tests/fixtures/filename_validation.json",
);

const cases: Case[] = JSON.parse(readFileSync(fixturePath, "utf8")).cases;

describe("validateFilename parity with fileops.validate_filename", () => {
  it("reads a table that covers both outcomes", () => {
    // A table that drifted into all-valid or all-invalid proves nothing.
    expect(new Set(cases.map((c) => c.valid))).toEqual(new Set([true, false]));
  });

  it.each(cases.map((c) => [c.why, c] as const))("%s", (_why, c) => {
    const input = c.name.repeat(c.repeat ?? 1);
    const error = validateFilename(input);
    if (c.valid) {
      expect(error).toBeNull();
    } else {
      expect(error).not.toBeNull();
    }
  });
});
