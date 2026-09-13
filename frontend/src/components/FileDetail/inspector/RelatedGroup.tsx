"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useAddonSlots } from "../../AddonSlotsProvider";

const GroupedContext = createContext(false);

/**
 * A context and not a prop because the same components are also drawn
 * ungrouped.
 */
export function useInRelatedGroup(): boolean {
  return useContext(GroupedContext);
}

/**
 * "Is there a second source" is asked of the catalogue rather than of
 * the DOM. A derived source is allowed to render a *collapsed* control
 * that has computed nothing yet, so "did it produce anything" is not
 * knowable from what it rendered.
 */
export function RelatedGroup({ children }: { children: ReactNode }) {
  const t = useTranslations("inspector.sections");
  const { getSlotEntries } = useAddonSlots();

  if (getSlotEntries("file-relations").length === 0) {
    return <>{children}</>;
  }

  return (
    <GroupedContext.Provider value={true}>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text-muted">
          {t("relatedGroup")}
        </h3>
        <div className="space-y-3">{children}</div>
      </section>
    </GroupedContext.Provider>
  );
}
