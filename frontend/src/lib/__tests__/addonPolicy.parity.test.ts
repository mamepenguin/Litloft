import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isAddonFeatureOn, isAddonOn, type AddonPolicy } from "@/lib/adminConfig";

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/tests/fixtures/addon_policy.json",
);

interface Case {
  name: string;
  addons: AddonPolicy[string] | null;
  on: boolean;
  features: Record<string, boolean>;
}

const cases: Case[] = JSON.parse(readFileSync(FIXTURE, "utf-8")).cases;

describe("the settings screens read a stored policy as the backend does", () => {
  it("reads the whole table, not some of it", () => {
    expect(cases.length).toBe(9);
  });

  it.each(cases)("$name", (c) => {
    const policy: AddonPolicy = c.addons === null ? {} : { d: c.addons };
    expect(isAddonOn(policy, "d", "knowledge")).toBe(c.on);
    for (const [feature, expected] of Object.entries(c.features)) {
      expect(isAddonFeatureOn(policy, "d", "knowledge", feature)).toBe(expected);
    }
  });
});
