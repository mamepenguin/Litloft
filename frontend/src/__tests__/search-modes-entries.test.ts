import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
   * A clone without `--recurse-submodules` has no manifest to read. Skipped
   * rather than passed, so the absence is visible in the report.
   */
  const whenPresent = it.skipIf(slots === null);

  whenPresent("registers the slot it is being measured on", () => {
    // A manifest with no `search-modes` key at all reads as an empty entry
    // list, which is a different thing from a slot registered with nothing
    // in it.
    expect(Object.keys(slots!)).toContain("search-modes");
  });

  whenPresent("offers exactly the modes that draw something", () => {
    expect(slots!["search-modes"].map((entry) => entry.id)).toEqual(["find-mode"]);
  });
});
