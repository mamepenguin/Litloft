"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { addPin, getPins, removePin, setHomeShortcut } from "@/lib/api";
import { useSidebar } from "@/components/SidebarProvider";
import { useToast } from "@/components/ToastProvider";

interface UsePinnedFoldersReturn {
  pinnedPaths: Set<string>;
  /** The pinned paths whose shortcut is on Home. */
  homePaths: Set<string>;
  handleTogglePin: (folderPath: string) => Promise<void>;
  handleToggleHome: (folderPath: string) => Promise<void>;
}

export function usePinnedFolders(driveName: string): UsePinnedFoldersReturn {
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [homePaths, setHomePaths] = useState<Set<string>>(new Set());
  const { requestRefresh: refreshSidebar } = useSidebar();
  const toast = useToast();
  const t = useTranslations("drive");
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    getPins(driveName)
      .then((pins) => {
        setPinnedPaths(new Set(pins.map((p) => p.path)));
        setHomePaths(new Set(pins.filter((p) => p.on_home).map((p) => p.path)));
      })
      .catch(() => {
        setPinnedPaths(new Set());
        setHomePaths(new Set());
      });
  }, [driveName]);

  const handleTogglePin = useCallback(
    async (folderPath: string) => {
      try {
        const isPinned = pinnedPaths.has(folderPath);
        if (isPinned) {
          await removePin(driveName, folderPath);
          setPinnedPaths((prev) => {
            const next = new Set(prev);
            next.delete(folderPath);
            return next;
          });
          setHomePaths((prev) => {
            const next = new Set(prev);
            next.delete(folderPath);
            return next;
          });
        } else {
          await addPin(driveName, folderPath);
          setPinnedPaths((prev) => new Set(prev).add(folderPath));
          setHomePaths((prev) => {
            const next = new Set(prev);
            next.delete(folderPath);
            return next;
          });
        }
        refreshSidebar();
      } catch {
        // ignore
      }
    },
    [driveName, pinnedPaths, refreshSidebar]
  );

  const handleToggleHome = useCallback(
    async (folderPath: string) => {
      if (inFlight.current.has(folderPath)) return;
      inFlight.current.add(folderPath);
      const onHome = homePaths.has(folderPath);
      try {
        await setHomeShortcut(driveName, {
          kind: "pin",
          id: folderPath,
          on_home: !onHome,
        });
        setHomePaths((prev) => {
          const next = new Set(prev);
          if (onHome) next.delete(folderPath);
          else next.add(folderPath);
          return next;
        });
      } catch {
        toast.error(t("homeShortcutFailed"));
      } finally {
        inFlight.current.delete(folderPath);
      }
    },
    [driveName, homePaths, toast, t],
  );

  return { pinnedPaths, homePaths, handleTogglePin, handleToggleHome };
}
