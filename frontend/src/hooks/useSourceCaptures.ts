"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  getSourceCaptures,
  subscribeSourceCaptures,
  type SourceCapture,
} from "@/lib/sourceCapture";

const EMPTY: readonly SourceCapture[] = [];

export function useSourceCaptures(drive: string | null): readonly SourceCapture[] {
  const subscribe = useCallback(
    (listener: () => void) =>
      drive ? subscribeSourceCaptures(drive, listener) : () => undefined,
    [drive],
  );
  const snapshot = useCallback(
    () => (drive ? getSourceCaptures(drive) : EMPTY),
    [drive],
  );
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
