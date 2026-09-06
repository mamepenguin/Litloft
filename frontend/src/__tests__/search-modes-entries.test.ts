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

/** The addon's `slots`, or `null` when the addon is not checked out. */
function slotsOf(addon: string): Record<string, SlotEntry[]> | null {
  const manifest = resolve(REPO_ROOT, "addons", addon, "manifest.json");
  if (!existsSync(manifest)) return null;
  const parsed = JSON.parse(readFileSync(manifest, "utf-8")) as {
    slots?: Record<string, SlotEntry[]>;
  };
  return parsed.slots ?? {};
}

describe("the search-modes slot", () => {
  const slots = slotsOf("intelligence");
  /**
   * A clone without `--recurse-submodules` has no manifest to read, and a
   * test that quietly passes there says the claim held when nothing was
   * checked. Skipped, so the absence is visible in the report.
   *
   * CI never takes this branch: the workflow checks out
   * `submodules: recursive` and fails outright on an empty addon directory.
   */
  const whenPresent = it.skipIf(slots === null);

  whenPresent("registers the slot it is being measured on", () => {
    // Rule (7), and the one real vacuity risk here: a manifest with no
    // `search-modes` key at all reads as an empty entry list, which is a
    // different thing from a slot registered with nothing in it.
    expect(Object.keys(slots!)).toContain("search-modes");
  });

  whenPresent("offers exactly the modes that draw something", () => {
    // `toEqual`, not a length or a `toContain`: the failure worth catching
    // is an entry arriving or leaving without anyone looking, and both
    // directions have now happened.
    expect(slots!["search-modes"].map((entry) => entry.id)).toEqual(["find-mode"]);
  });
});
