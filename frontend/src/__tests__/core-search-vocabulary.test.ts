import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./helpers/sourceScan";
import { MATCH_BADGES } from "@/lib/matchBadges";
import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

/**
 * Core draws its own search vocabulary, so core owns the words.
 *
 * The result badges and the "matched on page N" line used to resolve out of
 * the intelligence addon's catalogue, which
 * `.claude/rules/frontend-conventions.md` forbids in both directions. It
 * held together by coincidence: those labels appear only under a
 * `match_meta`, and only a semantic hit builds one, so the catalogue was
 * present exactly when they were needed. A legend that describes every
 * badge whether it is standing or not ends the coincidence, and an install
 * without the addon renders the missing rows as their key names.
 *
 * Three claims, each with its own failure:
 *
 *  1. **Who asks** — the files calling `useTranslations("search")` are the
 *     ones listed here. Scanned on one side, enumerated on the other, so a
 *     caller appearing and a caller vanishing both fail. Enumerating alone
 *     misses the seventh file; scanning alone shrinks the population when a
 *     caller leaves and stays green (detector rule 5).
 *  2. **How much each asks for** — a per-caller count. The population below
 *     is a union, and the two badge-drawing files ask for the *same* nine
 *     keys, so one of them quietly dropping one is invisible in the union.
 *  3. **That all of it resolves** — every key, in both catalogues. The
 *     population is the callers' own `t()` keys *plus* the label and help
 *     keys declared in `lib/matchBadges.ts`: the badges and the legend are
 *     drawn from that table rather than from strings in the components, so
 *     a population read only out of the components would miss sixteen of
 *     the words core needs.
 *
 * **The population is not "keys that look like badges."** A `match[A-Z]`
 * pattern misses `matchedPages` — lowercase after `match` — which is
 * precisely the key that made the handover six rather than five. A
 * population built by spelling loses whatever is spelled differently
 * (rule 6).
 */
const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every core file that draws from the `search` namespace, with how many
 * keys it asks for.
 *
 * The counts are what make each caller load-bearing rather than carried by
 * the others. They say a file did not quietly stop asking; *which* keys it
 * asks for is the resolve check's business, and any of them is a failure
 * there if core does not hold it.
 */
const CALLERS: Record<string, number> = {
  "app/drive/[name]/search/page.tsx": 2,
  "components/FolderBrowser.tsx": 1,
  "components/GlobalSearch.tsx": 9,
  // One each: the badge words come from `MATCH_BADGES`, and `matchedPages`
  // is the line that is not a badge.
  "components/MatchOverlay.tsx": 1,
  "components/search/MergedResultItem.tsx": 1,
  "components/search/SearchEmptyState.tsx": 4,
  // None by name: the legend draws every word it shows out of
  // `MATCH_BADGES`, which is the point of it — a legend with literals of
  // its own could describe a badge that is not there.
  "components/search/MatchLegend.tsx": 0,
};

const HANDLE = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*"search"\s*\)/;

/** The keys a file passes to its `useTranslations("search")` handle. */
function searchKeysUsedIn(relPath: string): string[] {
  const code = stripComments(readFileSync(resolve(SRC_ROOT, relPath), "utf8"));
  const handle = code.match(HANDLE);
  if (!handle) return [];
  return [
    ...code.matchAll(new RegExp(`\\b${handle[1]}\\(\\s*"([^"]+)"`, "g")),
  ].map((m) => m[1]);
}

/** Every file under `src/` that opens the namespace at all. */
function callersFound(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      // `addons` is a symlink to submodule checkouts — an addon drawing its
      // own namespace is the addon's business, and on a clone without
      // submodules it is not there to read.
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
    //
    // Exact, not `>= 1`: under a lower bound a file that stopped asking for
    // one of nine is carried by the file that still asks for the same nine.
    expect(new Set(searchKeysUsedIn(caller)).size).toBe(count);
  });

  it.each(["ja", "en"] as const)("resolves in core's own %s catalogue", (locale) => {
    const used = [
      ...new Set([
        ...Object.keys(CALLERS).flatMap(searchKeysUsedIn),
        ...MATCH_BADGES.flatMap((badge) => [badge.labelKey, badge.helpKey]),
      ]),
    ].sort();
    // Rule (7): the loop below is true of no keys at all, so the population
    // is asserted first. Sixteen from the badge table, eight from the
    // components' own calls.
    expect(used.length).toBe(33);
    const missing = used.filter((key) => !(key in namespaces[locale]));
    // Named, not counted: a failure should say which word is missing.
    expect(missing).toEqual([]);
  });

  it("draws its badges from a table with every badge in it", () => {
    // The legend describes what this table holds, so a badge missing from
    // it is a badge with no explanation — and one nothing draws.
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
