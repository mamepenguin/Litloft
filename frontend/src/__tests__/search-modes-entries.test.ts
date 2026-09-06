import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * What the `search-modes` slot offers, named rather than counted.
 *
 * The two detectors that already read addon manifests cannot see an entry
 * leave. `i18n-keys.test.ts` collects only entries carrying an `i18n_key`,
 * and `search-modes`'s carry a plain `label`; `addon-slot-layouts.test.ts`
 * reads layout names and never the entries. **Both build their expectation
 * out of the manifest they are checking**, so removing an entry moves the
 * observation and the expectation together and passes (detector rule 5).
 *
 * That is not hypothetical here: the `semantic-search` entry pointed at a
 * component that drew nothing at all, in either of the two layouts it
 * offered, and no test in either repository noticed.
 *
 * Scope is this one slot. A ledger of every entry of every slot is a
 * different job, and a bigger one than the claim being made here.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface SlotEntry {
  id: string;
  label?: string;
  i18n_key?: string;
  priority?: number;
}

function searchModeEntryIds(addon: string): string[] | null {
  const manifest = resolve(REPO_ROOT, "addons", addon, "manifest.json");
  // A clone without `--recurse-submodules` has no addon to read. Absent is
  // absent, not empty — an empty answer here would satisfy an expectation
  // of "no entries" and turn a missing checkout into a passing claim.
  if (!existsSync(manifest)) return null;
  const parsed = JSON.parse(readFileSync(manifest, "utf-8")) as {
    slots?: Record<string, SlotEntry[]>;
  };
  return (parsed.slots?.["search-modes"] ?? []).map((entry) => entry.id);
}

describe("the search-modes slot", () => {
  const entries = searchModeEntryIds("intelligence");

  it("offers exactly the modes that draw something", () => {
    if (entries === null) return; // submodule-less clone; see above
    // `toEqual`, not a length or a `toContain`: the failure worth catching
    // is an entry arriving or leaving without anyone looking, and both
    // directions have now happened.
    expect(entries).toEqual(["find-mode"]);
  });

  it("reads a manifest that has the slot at all", () => {
    // Rule (7). "The entries are exactly these" would also hold of a
    // manifest this function failed to parse into anything.
    if (entries === null) return;
    expect(entries.length).toBe(1);
  });
});
