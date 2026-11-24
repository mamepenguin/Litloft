"use client";

import { useCallback, useEffect, useState } from "react";

import {
  appKeyFromId,
  appKeyId,
  readShownTargets,
  writeShownTargets,
  type AppKey,
} from "@/lib/appPrefs";

/**
 * The Target menu's shown set, kept in memory as well as storage so a toggle
 * still applies while the page is open when storage refuses the write.
 *
 * The app key is compared by value, so a caller may write it inline.
 */
export function useShownTargets(app: AppKey, drive: string) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const appId = appKeyId(app);

  useEffect(() => {
    setSaved(readShownTargets(drive, appKeyFromId(appId)));
  }, [appId, drive]);

  const setShown = useCallback(
    (ids: string[]) => {
      setSaved(ids);
      writeShownTargets(drive, ids, appKeyFromId(appId));
    },
    [appId, drive],
  );

  return { saved, setShown };
}
