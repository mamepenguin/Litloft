"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useAddonSlots } from "../../AddonSlotsProvider";

/**
 * "Related", once, over both kinds of relation.
 *
 * Core's own `file_relations` and whatever an addon derives —
 * similarity, shared keywords — were two headings answering the same
 * question, so a reader had to know which one a given connection would
 * have been filed under.
 *
 * The heading is drawn only when there is a second source to group
 * with. On a drive with no such addon — or one where policy has
 * filtered it out — core's relations keep their own heading and nothing
 * is nested inside anything, because a grouping heading over a single
 * group is a row that says only that a category exists.
 *
 * "Is there a second source" is asked of the catalogue rather than of
 * the DOM. A derived source is allowed to render a *collapsed* control
 * that has computed nothing yet — that is the whole shape §3 settled on
 * for similarity, which is too expensive to run unasked — so "did it
 * produce anything" is not knowable from what it rendered, and a
 * CSS-level emptiness test would either hide a live control or never
 * fire at all.
 */
export function RelatedGroup({ children }: { children: ReactNode }) {
  const t = useTranslations("inspector.sections");
  const { getSlotEntries } = useAddonSlots();

  if (getSlotEntries("file-relations").length === 0) {
    return <>{children}</>;
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text-muted">
        {t("relatedGroup")}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
