import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import jaMessages from "../messages-core/ja.json";
import enMessages from "../messages-core/en.json";

// Recursive type: keys may point to strings or nested objects of
// arbitrary depth. Before this was `Record<string, string | Record<…>>`
// which only tolerated 2 levels — the addon message catalogues grew
// 3-level nesting (e.g. `detailedSummary.citations.linkLabel`) when the
// intelligence detailed-summary feature landed.
type MessageObject = { [key: string]: string | MessageObject };

function getAllKeys(obj: MessageObject, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      keys.push(...getAllKeys(value as MessageObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n key consistency", () => {
  const jaKeys = getAllKeys(jaMessages as MessageObject);
  const enKeys = getAllKeys(enMessages as MessageObject);

  it("ja.json and en.json have the same number of keys", () => {
    expect(jaKeys.length).toBe(enKeys.length);
  });

  it("ja.json and en.json have identical key sets", () => {
    expect(jaKeys).toEqual(enKeys);
  });

  it("all keys in ja.json exist in en.json", () => {
    const enKeySet = new Set(enKeys);
    const missingInEn = jaKeys.filter((key) => !enKeySet.has(key));
    expect(missingInEn).toEqual([]);
  });

  it("all keys in en.json exist in ja.json", () => {
    const jaKeySet = new Set(jaKeys);
    const missingInJa = enKeys.filter((key) => !jaKeySet.has(key));
    expect(missingInJa).toEqual([]);
  });

  it("no empty string values in ja.json", () => {
    const emptyKeys = jaKeys.filter((key) => {
      const parts = key.split(".");
      let current: unknown = jaMessages;
      for (const part of parts) {
        current = (current as Record<string, unknown>)[part];
      }
      return current === "";
    });
    expect(emptyKeys).toEqual([]);
  });

  it("no empty string values in en.json", () => {
    const emptyKeys = enKeys.filter((key) => {
      const parts = key.split(".");
      let current: unknown = enMessages;
      for (const part of parts) {
        current = (current as Record<string, unknown>)[part];
      }
      return current === "";
    });
    expect(emptyKeys).toEqual([]);
  });
});

// Addon catalogues are merged into the same tree at build time
// (`scripts/merge-addon-messages.mjs` deep-merges `src/addons/*/messages/`),
// but only core's pair was ever compared. A key present in one locale and not
// the other falls back to showing the key path itself on the page, and a key
// that collides with core silently replaces core's string — the merge has no
// opinion about which wins.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");

function addonCatalogues(): { addon: string; ja: MessageObject; en: MessageObject }[] {
  if (!existsSync(ADDONS_DIR)) return [];
  const out: { addon: string; ja: MessageObject; en: MessageObject }[] = [];
  for (const entry of readdirSync(ADDONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(ADDONS_DIR, entry.name, "frontend/messages");
    const ja = resolve(dir, "ja.json");
    const en = resolve(dir, "en.json");
    // An addon may ship no catalogue at all; only a half one is a defect.
    if (!existsSync(ja) && !existsSync(en)) continue;
    out.push({
      addon: entry.name,
      ja: existsSync(ja) ? JSON.parse(readFileSync(ja, "utf-8")) : {},
      en: existsSync(en) ? JSON.parse(readFileSync(en, "utf-8")) : {},
    });
  }
  return out;
}

describe("addon i18n catalogues", () => {
  const catalogues = addonCatalogues();
  const coreKeys = new Set(getAllKeys(jaMessages as MessageObject));

  it("finds the addons checked out beside core", () => {
    expect(catalogues.length).toBeGreaterThan(0);
  });

  it.each(catalogues.map((c) => [c.addon, c] as const))(
    "%s ships the same keys in both locales",
    (_addon, catalogue) => {
      const ja = getAllKeys(catalogue.ja);
      const en = getAllKeys(catalogue.en);
      expect({ jaOnly: ja.filter((k) => !en.includes(k)) }).toEqual({ jaOnly: [] });
      expect({ enOnly: en.filter((k) => !ja.includes(k)) }).toEqual({ enOnly: [] });
    },
  );

  it.each(catalogues.map((c) => [c.addon, c] as const))(
    "%s does not overwrite a core key",
    (_addon, catalogue) => {
      const clashes = getAllKeys(catalogue.ja).filter((k) => coreKeys.has(k));
      expect(clashes).toEqual([]);
    },
  );

  it("no two addons claim the same key", () => {
    const owners = new Map<string, string[]>();
    for (const { addon, en } of catalogues) {
      for (const key of getAllKeys(en)) {
        owners.set(key, [...(owners.get(key) ?? []), addon]);
      }
    }
    const shared = [...owners.entries()]
      .filter(([, who]) => who.length > 1)
      .map(([key, who]) => `${key} (${who.join(", ")})`);
    expect(shared).toEqual([]);
  });
});
