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
 * Rescan a drive, and say what happened.
 *
 * The button lives in an overflow menu that closes on click, so the
 * spinner this hook's `scanning` flag drives was rendered inside a menu
 * nobody could still see: pressing Rescan looked like pressing nothing
 * for however long the walk took. A 409 (a scan already running) and a
 * real failure were both swallowed by a bare `catch`, so the two
 * indistinguishable silences were "working", "already working" and
 * "broken".
 *
 * Toasts rather than the WebSocket's `scan:complete`: the result
 * belongs to whoever pressed the button, and the socket tells every
 * client. Progress — as opposed to the outcome — is Phase 4's.
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
        // Not a failure: the scanner takes one run per drive at a time
        // (backend-conventions.md, "Concurrency control patterns").
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
