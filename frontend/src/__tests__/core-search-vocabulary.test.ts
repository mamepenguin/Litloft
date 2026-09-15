import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./helpers/sourceScan";
import { MATCH_BADGES } from "@/lib/matchBadges";
import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

/**
 * The resolved population includes the label and help keys declared in
 * `lib/matchBadges.ts`: the badges and the legend are drawn from that table
 * rather than from strings in the components.
 */
const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CALLERS: Record<string, number> = {
  "app/drive/[name]/search/page.tsx": 2,
  "components/FolderBrowser.tsx": 1,
  "components/GlobalSearch.tsx": 9,
  // One each: the badge words come from `MATCH_BADGES`, and `matchedPages`
  // is the line that is not a badge.
  "components/MatchOverlay.tsx": 1,
  "components/search/MergedResultItem.tsx": 1,
  "components/search/ScopedSearchParts.tsx": 6,
  "components/search/SearchEmptyState.tsx": 4,
  // None by name: the legend draws every word it shows out of
  // `MATCH_BADGES`.
  "components/search/MatchLegend.tsx": 0,
};

const HANDLE = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*"search"\s*\)/;

function searchKeysUsedIn(relPath: string): string[] {
  const code = stripComments(readFileSync(resolve(SRC_ROOT, relPath), "utf8"));
  const handle = code.match(HANDLE);
  if (!handle) return [];
  return [
    ...code.matchAll(new RegExp(`\\b${handle[1]}\\(\\s*"([^"]+)"`, "g")),
  ].map((m) => m[1]);
}

function callersFound(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      // `addons` is a link tree over the submodule checkouts — an addon
      // drawing its own namespace is the addon's business, and on a clone
      // without submodules it is not there to read.
      if (entry.name === "addons" || entry.name === "__tests__") continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && HANDLE.test(readFileSync(full, "utf8"))) {
        out.push(relative(SRC_ROOT, full));
      }
    }
  };
  walk(SRC_ROOT);
  return out.sort();
}

const namespaces = {
  ja: ja.search as Record<string, string>,
  en: en.search as Record<string, string>,
};

describe("the search vocabulary core draws", () => {
  it("is drawn by the files this test knows about", () => {
    expect(callersFound()).toEqual(Object.keys(CALLERS).sort());
  });

  it.each(Object.entries(CALLERS))("%s asks for its whole share", (caller, count) => {
    // Distinct keys, not calls: `GlobalSearch` draws one of its words in
    // two places, and that is not a share of two.
    expect(new Set(searchKeysUsedIn(caller)).size).toBe(count);
  });

  it.each(["ja", "en"] as const)("resolves in core's own %s catalogue", (locale) => {
    const used = [
      ...new Set([
        ...Object.keys(CALLERS).flatMap(searchKeysUsedIn),
        ...MATCH_BADGES.flatMap((badge) => [badge.labelKey, badge.helpKey]),
      ]),
    ].sort();
    // The check below is true of no keys at all, so the population is
    // asserted first.
    expect(used.length).toBe(39);
    const missing = used.filter((key) => !(key in namespaces[locale]));
    // Named, not counted: a failure should say which word is missing.
    expect(missing).toEqual([]);
  });

  it("draws its badges from a table with every badge in it", () => {
    expect(MATCH_BADGES.map((badge) => badge.key)).toEqual([
      "filename",
      "path",
      "metadata",
      "transcript",
      "clip",
      "clip_thumbnail",
      "content",
      "retrieval_keywords",
    ]);
  });
});
