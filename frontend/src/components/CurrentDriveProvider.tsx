"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface CurrentDriveContextValue {
  currentDrive: string | null;
  currentFolderPath: string | null;
  setOverrideDrive: (drive: string | null) => void;
}

const CurrentDriveContext = createContext<CurrentDriveContextValue>({
  currentDrive: null,
  currentFolderPath: null,
  setOverrideDrive: () => {},
});

function driveFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/drive\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Sibling routes under /drive/[name]/ that are not folder paths
// (see frontend/src/app/drive/[name]/), so [...path] never sees them.
const NON_FOLDER_ROUTE_SEGMENTS = new Set(["search", "collections"]);

function folderPathFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/drive\/[^/]+\/(.+)$/);
  if (!match) return null;
  const segments = match[1].split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length === 0 || NON_FOLDER_ROUTE_SEGMENTS.has(segments[0])) return null;
  return segments.join("/");
}

export function CurrentDriveProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [overrideDrive, setOverrideDriveState] = useState<string | null>(null);

  const pathDrive = driveFromPath(pathname);
  const pathFolderPath = folderPathFromPath(pathname);

  const setOverrideDrive = useCallback((drive: string | null) => {
    setOverrideDriveState(drive);
  }, []);

  const value = useMemo(
    () => ({
      currentDrive: pathDrive ?? overrideDrive,
      // Only meaningful when the drive itself comes from the URL; an
      // override drive (used by drive-independent pages) never has a
      // folder context.
      currentFolderPath: pathDrive ? pathFolderPath : null,
      setOverrideDrive,
    }),
    [pathDrive, pathFolderPath, overrideDrive, setOverrideDrive],
  );

  return (
    <CurrentDriveContext.Provider value={value}>
      {children}
    </CurrentDriveContext.Provider>
  );
}

export function useCurrentDrive(): string | null {
  return useContext(CurrentDriveContext).currentDrive;
}

export function useCurrentFolderPath(): string | null {
  return useContext(CurrentDriveContext).currentFolderPath;
}

export function useSetOverrideDrive(): (drive: string | null) => void {
  return useContext(CurrentDriveContext).setOverrideDrive;
}
