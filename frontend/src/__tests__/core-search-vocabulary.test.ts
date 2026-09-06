import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./helpers/sourceScan";
import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

/**
 * Core draws the search result badges, so core owns their words.
 *
 * They used to resolve out of the intelligence addon's catalogue, which
 * `.claude/rules/frontend-conventions.md` forbids in both directions. It
 * worked by coincidence: the labels appear only under a `match_meta`, and
 * only a semantic hit builds one, so the catalogue happened to be there
 * whenever the labels were. A legend that describes every badge whether it
 * is standing or not ends the coincidence, and an install without the addon
 * would render the missing rows as their key names.
 *
 * Two independent sets, compared — not one set counted twice:
 *
 *  - the population is **what the core files actually ask for**, read out of
 *    their `t(...)` calls;
 *  - the expectation is **what `messages-core` holds**.
 *
 * Either side moving alone fails, which a `toBe(9)` on one of them would
 * not: counting `messages-core` would move the observation and the
 * expectation together every time a key is added (detector rule 5).
 *
 * **The population is not "keys that look like badges."** A `match[A-Z]`
 * pattern misses `matchedPages` — lowercase after `match` — which is exactly
 * the key that made the handover six rather than five. Populations built by
 * spelling lose whatever is spelled differently (rule 6).
 */
/** `frontend/src`, which is what `CALLERS` are relative to. */
const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The core files that draw from the `search` namespace, enumerated.
 *
 * Found by scanning instead, a file that stopped drawing them would shrink
 * the population rather than fail — the detector would go green on the
 * regression it exists for (rule 5).
 */
const CALLERS = [
  "components/MatchOverlay.tsx",
  "components/search/MergedResultItem.tsx",
] as const;

/** The keys a file passes to its `useTranslations("search")` handle. */
function searchKeysUsedIn(relPath: string): string[] {
  const code = stripComments(readFileSync(resolve(SRC_ROOT, relPath), "utf8"));
  const handle = code.match(
    /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*"search"\s*\)/,
  );
  if (!handle) return [];
  const calls = [...code.matchAll(new RegExp(`\\b${handle[1]}\\(\\s*"([^"]+)"`, "g"))];
  return calls.map((m) => m[1]);
}

const namespaces = { ja: ja.search as Record<string, string>, en: en.search as Record<string, string> };

describe("the search vocabulary core draws", () => {
  const used = [...new Set(CALLERS.flatMap(searchKeysUsedIn))].sort();

  it("is asked for by the files that are supposed to ask", () => {
    // Rule (7), and the reason the loop below cannot pass on silence: a
    // renamed handle, a moved file or a regex that stopped matching all
    // read as "no keys used", and every key resolving is true of none.
    expect(CALLERS.length).toBe(2);
    for (const caller of CALLERS) {
      expect(searchKeysUsedIn(caller).length).toBeGreaterThan(0);
    }
    expect(used.length).toBe(9);
  });

  it.each(["ja", "en"] as const)("resolves in core's own %s catalogue", (locale) => {
    const missing = used.filter((key) => !(key in namespaces[locale]));
    // Named, not counted: a failure here should say which word is missing.
    expect(missing).toEqual([]);
  });
});
