"use client";

import { useSyncExternalStore } from "react";

import { dirtyRegistry } from "@/lib/dirtyRegistry";

export function useIsDirty(fileId?: string): boolean {
  return useSyncExternalStore(
    dirtyRegistry.subscribe,
    () => dirtyRegistry.isDirty(fileId),
    () => false,
  );
}
