"use client";

import { useEffect } from "react";

import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { useActiveSummary } from "@/hooks/useActiveSummary";
import { ActiveSummaryFallback } from "@/components/ActiveSummaryFallback";

export function ActiveSummaryHost({
  fileId,
  drive,
  onAvailability,
}: {
  fileId: string;
  drive: string;
  onAvailability?: (available: boolean) => void;
}) {
  const { data } = useActiveSummary(fileId, drive);
  const { hasSlot } = useAddonSlots();
  const available = Boolean(data?.has_active_summary && data.summary_note);

  useEffect(() => {
    onAvailability?.(available);
  }, [available, onAvailability]);

  if (!available) return null;

  const slotId = "active-summary-view";
  if (hasSlot(slotId)) {
    return (
      <AddonSlot
        id={slotId}
        layout="stack"
        props={{
          fileId,
          drive,
          summaryNote: data!.summary_note,
        }}
      />
    );
  }

  return <ActiveSummaryFallback summaryNote={data!.summary_note!} />;
}
