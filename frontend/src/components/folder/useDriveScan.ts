"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { ApiStatusError, scanDrive } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

interface UseDriveScanReturn {
  scanning: boolean;
  handleScan: () => Promise<void>;
}

/**
 * Toasts rather than the WebSocket's `scan:complete`: the result
 * belongs to whoever pressed the button, and the socket tells every
 * client.
 */
export function useDriveScan(driveName: string, onComplete: () => void): UseDriveScanReturn {
  const [scanning, setScanning] = useState(false);
  const toast = useToast();
  const t = useTranslations("toolbar");

  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    toast.info(t("scanStarted", { drive: driveName }));
    try {
      const result = await scanDrive(driveName);
      onComplete();
      const changed = result.added + result.recovered + result.missing;
      toast.success(
        changed > 0
          ? t("scanDone", {
              added: result.added,
              recovered: result.recovered,
              missing: result.missing,
            })
          : t("scanDoneNoChange"),
      );
    } catch (err) {
      if (err instanceof ApiStatusError && err.status === 409) {
        // Not a failure: the scanner takes one run per drive at a time.
        toast.info(t("scanAlreadyRunning"));
      } else {
        console.error("drive rescan failed:", err);
        toast.error(t("scanFailed"));
      }
    } finally {
      setScanning(false);
    }
  }, [scanning, driveName, onComplete, toast, t]);

  return { scanning, handleScan };
}
