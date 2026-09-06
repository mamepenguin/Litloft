"use client";

import { useTranslations } from "next-intl";

import { MATCH_BADGES } from "@/lib/matchBadges";

/**
 * What the badges on a result row mean, one line each.
 *
 * S-4. The badges say *why* a file matched, and eight single words cannot
 * carry it on their own — "Visual" and "Keyword" are the search's
 * vocabulary, not the reader's. The explanation sits here rather than on
 * the badges because `title` is read out a second time after an element's
 * name by NVDA and JAWS (`DESIGN.md` §Row Actions), and never appears at
 * all on a touch screen.
 *
 * Drawn from `MATCH_BADGES`, so it lists exactly the badges that exist: a
 * legend with a list of its own could describe one nobody draws, and leave
 * one that is on screen unexplained.
 */
export function MatchLegend() {
  const t = useTranslations("search");
  return (
    <ul className="flex flex-col gap-2 px-4 py-3">
      {MATCH_BADGES.map((badge) => (
        <li key={badge.key} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 inline-flex shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${badge.style}`}
          >
            {t(badge.labelKey)}
          </span>
          <span className="text-xs text-text-muted">{t(badge.helpKey)}</span>
        </li>
      ))}
    </ul>
  );
}
