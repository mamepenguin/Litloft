"use client";

import { useTranslations } from "next-intl";

import { useAddonSlots } from "../../AddonSlotsProvider";
import { RelatedPanel } from "./RelatedPanel";
import { useFileRelations } from "./useFileRelations";

export function RelatedStack({
  fileId,
  addonSlotProps,
}: {
  fileId: string;
  addonSlotProps: Record<string, unknown>;
}) {
  const t = useTranslations("inspector.tabs");
  const { getSlotEntries } = useAddonSlots();
  const relations = useFileRelations(fileId);

  if (
    (relations?.length ?? 0) === 0 &&
    getSlotEntries("file-relations").length === 0
  ) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text-muted">
        {t("related")}
      </h2>
      <RelatedPanel relations={relations ?? []} addonSlotProps={addonSlotProps} />
    </section>
  );
}
