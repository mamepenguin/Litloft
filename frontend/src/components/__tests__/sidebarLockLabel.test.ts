import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { stripComments } from "@/__tests__/helpers/sourceScan";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Asserted on the source: a rendered test with a stubbed `useTranslations`
 * would report the key whether or not the key was ever used.
 */
describe("the sidebar's lock control", () => {
  const src = stripComments(
    readFileSync(resolve(REPO_ROOT, "frontend/src/components/Sidebar.tsx"), "utf-8"),
  );

  it("writes no English label of its own", () => {
    expect(src).not.toMatch(/>\s*Lock\s*</);
  });

  it("takes its label from the catalogue", () => {
    expect(src).toContain('t("lock")');
    for (const locale of ["ja", "en"]) {
      const messages = JSON.parse(
        readFileSync(
          resolve(REPO_ROOT, `frontend/src/messages-core/${locale}.json`),
          "utf-8",
        ),
      );
      expect(messages.sidebar.lock).toBeTruthy();
    }
  });

  /**
   * `common.lock` exists and is a noun — the state, as a filter chip
   * reads it. This row is an act, so it gets its own key rather than
   * borrowing one whose Japanese ("ロック") is the wrong part of speech.
   */
  it("does not borrow the noun", () => {
    const ja = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "frontend/src/messages-core/ja.json"), "utf-8"),
    );
    expect(ja.sidebar.lock).not.toBe(ja.common?.lock);
  });
});
