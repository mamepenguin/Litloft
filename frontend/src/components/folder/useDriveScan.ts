"use client";

import { useCallback, useState } from "react";

import { scanDrive } from "@/lib/api";

interface UseDriveScanReturn {
  scanning: boolean;
  handleScan: () => Promise<void>;
}

export function useDriveScan(driveName: string, onComplete: () => void): UseDriveScanReturn {
  const [scanning, setScanning] = useState(false);

  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await scanDrive(driveName);
      onComplete();
    } catch {
      // 409 = already scanning, ignore
    } finally {
      setScanning(false);
    }
  }, [scanning, driveName, onComplete]);

  return { scanning, handleScan };
}
