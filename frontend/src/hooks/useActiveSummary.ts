"use client";

import { useEffect, useState } from "react";
import { getActiveSummary, type ActiveSummaryResponse } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

export function useActiveSummary(fileId: string | null | undefined): {
  data: ActiveSummaryResponse | null;
  loading: boolean;
} {
  const [data, setData] = useState<ActiveSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const summaryEvent = useWebSocket("core.file_active_summary.changed");

  useEffect(() => {
    if (!fileId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getActiveSummary(fileId)
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
  }, [fileId]);

  useEffect(() => {
    if (!summaryEvent || !fileId) return;
    if (summaryEvent.data?.file_id !== fileId) return;
    getActiveSummary(fileId)
      .then(setData)
      .catch(() => {
        // keep stale data on transient failures
      });
  }, [summaryEvent, fileId]);

  return { data, loading };
}
