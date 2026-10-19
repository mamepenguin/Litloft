"use client";

import { useTranslations } from "next-intl";

import { MATCH_BADGES } from "@/lib/matchBadges";

/**
 * The explanation sits here rather than on the badges because `title` is
 * read out a second time after an element's name by NVDA and JAWS, and never
 * appears at all on a touch screen.
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
