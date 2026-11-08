"use client";

import { useCallback, useEffect, useState } from "react";

import { readShownTargets, writeShownTargets, type AppId } from "@/lib/appPrefs";

/**
 * The Target menu's shown set, kept in memory as well as storage so a toggle
 * still applies while the page is open when storage refuses the write.
 */
export function useShownTargets(app: AppId, drive: string) {
  const [saved, setSaved] = useState<string[] | null>(null);

  useEffect(() => {
    setSaved(readShownTargets(drive, app));
  }, [app, drive]);

  const setShown = useCallback(
    (ids: string[]) => {
      setSaved(ids);
      writeShownTargets(drive, ids, app);
    },
    [app, drive],
  );

  return { saved, setShown };
}
