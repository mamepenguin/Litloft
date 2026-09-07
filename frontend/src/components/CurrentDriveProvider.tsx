"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

interface CurrentDriveContextValue {
  currentDrive: string | null;
  currentFolderPath: string | null;
  setOverrideDrive: (drive: string | null) => void;
  setOverrideFolderPath: (path: string | null) => void;
}

const CurrentDriveContext = createContext<CurrentDriveContextValue>({
  currentDrive: null,
  currentFolderPath: null,
  setOverrideDrive: () => {},
  setOverrideFolderPath: () => {},
});

function driveFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/drive\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function CurrentDriveProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [overrideDrive, setOverrideDriveState] = useState<string | null>(null);
  // Published by the folder page itself (frontend/src/app/drive/[name]/[...path]/page.tsx),
  // not parsed from the URL here. Any sibling route under /drive/[name]/
  // (search, collections, addons/...) simply never calls this, so it's
  // null there for free — no denylist of route segments to keep in sync
  // with app/drive/[name]/ as routes are added.
  const [overrideFolderPath, setOverrideFolderPathState] = useState<string | null>(null);

  const pathDrive = driveFromPath(pathname);

  /**
   * An override belongs to the route that published it, and dies with it.
   *
   * `currentDrive` is `pathDrive ?? overrideDrive`, so on a route whose URL
   * carries no drive — `/`, `/admin`, `/settings` — a stale override is the
   * whole answer. That is how the root page came to name a drive beside its
   * own cards: the sidebar's collection click publishes one and never
   * clears it, and the two components that do clear it do so in their own
   * effect cleanups, which is three separate places remembering to keep one
   * invariant.
   *
   * Clearing on every navigation makes it structural instead. A surface
   * that still owns a drive republishes it in its own effect, which runs
   * after the route change — `FileDetailFullScreen` already does, after its
   * fetch, and `CollectionDetail` synchronously on mount.
   */
  useEffect(() => {
    setOverrideDriveState(null);
  }, [pathname]);

  const setOverrideDrive = useCallback((drive: string | null) => {
    setOverrideDriveState(drive);
  }, []);

  const setOverrideFolderPath = useCallback((path: string | null) => {
    setOverrideFolderPathState(path);
  }, []);

  const value = useMemo(
    () => ({
      currentDrive: pathDrive ?? overrideDrive,
      currentFolderPath: overrideFolderPath,
      setOverrideDrive,
      setOverrideFolderPath,
    }),
    [pathDrive, overrideDrive, overrideFolderPath, setOverrideDrive, setOverrideFolderPath],
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

export function useSetOverrideFolderPath(): (path: string | null) => void {
  return useContext(CurrentDriveContext).setOverrideFolderPath;
}
