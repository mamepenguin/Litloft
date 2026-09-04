"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * "Related", once, over both kinds of relation.
 *
 * The core's own `file_relations` and whatever an addon derives —
 * similarity, shared keywords — were two separate headings answering
 * the same question, so a reader had to know which of them a given
 * connection would have been filed under. One heading, and each source
 * keeps its own disclosure inside it, so "1 related · 4 similar
 * (automatic)" reads as two answers to one question instead of two
 * questions.
 *
 * Renders nothing when neither side has anything, rather than a heading
 * over a blank: a section that only says a feature exists is what this
 * phase is removing.
 */
export function RelatedGroup({ children }: { children: ReactNode }) {
  const t = useTranslations("inspector.sections");
  return (
    // Hidden when nothing rendered inside it. `empty:hidden` cannot do
    // this — the heading is always a child — so the test is on the
    // content wrapper instead: no element children means both sources
    // returned null, and a heading over nothing is exactly the row this
    // phase is removing.
    <section className="[&:not(:has(>div>*))]:hidden">
      <h3 className="mb-2 text-sm font-semibold text-text-muted">
        {t("relatedGroup")}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
