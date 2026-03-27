"use client";

import { useCallback, useEffect, useState } from "react";

import { addPin, getPins, removePin } from "@/lib/api";
import { useSidebar } from "@/components/SidebarProvider";

interface UsePinnedFoldersReturn {
  pinnedPaths: Set<string>;
  handleTogglePin: (folderPath: string) => Promise<void>;
}

export function usePinnedFolders(driveName: string): UsePinnedFoldersReturn {
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const { requestRefresh: refreshSidebar } = useSidebar();

  useEffect(() => {
    getPins(driveName)
      .then((pins) => setPinnedPaths(new Set(pins.map((p) => p.path))))
      .catch(() => setPinnedPaths(new Set()));
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
        } else {
          await addPin(driveName, folderPath);
          setPinnedPaths((prev) => new Set(prev).add(folderPath));
        }
        refreshSidebar();
      } catch {
        // ignore
      }
    },
    [driveName, pinnedPaths, refreshSidebar]
  );

  return { pinnedPaths, handleTogglePin };
}
