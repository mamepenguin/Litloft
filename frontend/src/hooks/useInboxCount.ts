"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getInboxCount } from "@/lib/api";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";

/** The open arrivals of the drive the sidebar is standing in. */
export function useInboxCount(drive: string | null): number {
  const [count, setCount] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!drive) {
      setCount(0);
      return;
    }
    const request = ++requestRef.current;
    try {
      const open = await getInboxCount(drive);
      if (requestRef.current === request) setCount(open);
    } catch {
      // The next drive change or event asks again.
    }
  }, [drive]);

  useEffect(() => {
    setCount(0);
    void load();
  }, [load]);

  useWebSocketRefresh(
    ["inbox.updated", "drive.structure_changed"],
    () => {
      void load();
    },
    drive ?? undefined,
  );

  return count;
}
