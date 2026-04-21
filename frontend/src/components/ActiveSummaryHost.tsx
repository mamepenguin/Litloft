"use client";

import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { useActiveSummary } from "@/hooks/useActiveSummary";
import { ActiveSummaryFallback } from "@/components/ActiveSummaryFallback";

export function ActiveSummaryHost({
  fileId,
  drive,
}: {
  fileId: string;
  drive: string;
}) {
  const { data } = useActiveSummary(fileId);
  const { hasSlot } = useAddonSlots();

  if (!data?.has_active_summary || !data.summary_note) return null;

  const slotId = "active-summary-view";
  if (hasSlot(slotId)) {
    return (
      <AddonSlot
        id={slotId}
        layout="stack"
        props={{
          fileId,
          drive,
          summaryNote: data.summary_note,
        }}
      />
    );
  }

  return <ActiveSummaryFallback summaryNote={data.summary_note} />;
}
