"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface CurrentDriveContextValue {
  currentDrive: string | null;
  setOverrideDrive: (drive: string | null) => void;
}

const CurrentDriveContext = createContext<CurrentDriveContextValue>({
  currentDrive: null,
  setOverrideDrive: () => {},
});

function driveFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/drive\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function CurrentDriveProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [overrideDrive, setOverrideDriveState] = useState<string | null>(null);

  const pathDrive = driveFromPath(pathname);

  const setOverrideDrive = useCallback((drive: string | null) => {
    setOverrideDriveState(drive);
  }, []);

  const value = useMemo(
    () => ({
      currentDrive: pathDrive ?? overrideDrive,
      setOverrideDrive,
    }),
    [pathDrive, overrideDrive, setOverrideDrive],
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

export function useSetOverrideDrive(): (drive: string | null) => void {
  return useContext(CurrentDriveContext).setOverrideDrive;
}
