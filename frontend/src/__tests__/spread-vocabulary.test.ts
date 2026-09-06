import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CORE = join(process.cwd(), "src", "messages-core");
const LOCALES = ["ja", "en"] as const;
const NAMESPACES = ["archive", "gallery"] as const;

function messages(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(CORE, `${locale}.json`), "utf8"));
}

/**
 * The label taught the wrong idea, and this is the evidence: the person
 * who wrote the feature remembered it backwards. "Spread mode" was a
 * toggle that *undid* a spread — it cut a wide scan in half. It now also
 * puts two tall pages side by side, and the word has to mean the reading
 * rather than the operation.
 */
describe("the spread vocabulary", () => {
  it("has no `splitMode` left in either namespace of either locale", () => {
    for (const locale of LOCALES) {
      const m = messages(locale);
      for (const ns of NAMESPACES) {
        expect(
          Object.keys(m[ns]).filter((k) => k.startsWith("splitMode")),
        ).toEqual([]);
      }
    }
  });

  it("has `spreadMode` and its toggle in all four places", () => {
    const found: string[] = [];
    for (const locale of LOCALES) {
      const m = messages(locale);
      for (const ns of NAMESPACES) {
        // Non-empty, not merely present: an empty string is a missing
        // translation that every key-existence check would pass.
        expect(m[ns].spreadMode?.length ?? 0).toBeGreaterThan(0);
        expect(m[ns].spreadModeToggle?.length ?? 0).toBeGreaterThan(0);
        found.push(`${locale}.${ns}`);
      }
    }
    expect(found).toEqual([
      "ja.archive",
      "ja.gallery",
      "en.archive",
      "en.gallery",
    ]);
  });

  it("names both states in the toggle's label, not the current one", () => {
    // "Toggle spread mode" is what produced the misreading: it never
    // said which state it was describing.
    for (const locale of LOCALES) {
      const m = messages(locale);
      for (const ns of NAMESPACES) {
        expect(m[ns].spreadModeToggle).toMatch(locale === "ja" ? /／/ : / \/ /);
      }
    }
  });
});
