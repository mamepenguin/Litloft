"use client";

import { useEffect, useState } from "react";
import { getActiveSummary, type ActiveSummaryResponse } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

export function useActiveSummary(
  fileId: string | null | undefined,
  drive: string | null | undefined,
): {
  data: ActiveSummaryResponse | null;
  loading: boolean;
} {
  const [data, setData] = useState<ActiveSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const summaryEvent = useWebSocket("knowledge.active_summary.changed");

  useEffect(() => {
    if (!fileId || !drive) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getActiveSummary(fileId, drive)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, drive]);

  useEffect(() => {
    if (!summaryEvent || !fileId || !drive) return;
    if (summaryEvent.data?.file_id !== fileId) return;
    getActiveSummary(fileId, drive)
      .then(setData)
      .catch(() => {
        // keep stale data on transient failures
      });
  }, [summaryEvent, fileId, drive]);

  return { data, loading };
}
