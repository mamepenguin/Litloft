"use client";

import { useEffect } from "react";

import {
  type DirtySource,
  dirtyRegistry,
} from "@/lib/dirtyRegistry";

interface UseDirtyOpts {
  fileId: string;
  source: DirtySource;
  dirty: boolean;
}

export function useDirty({ fileId, source, dirty }: UseDirtyOpts): void {
  useEffect(() => {
    dirtyRegistry.set(fileId, source, dirty);
  }, [fileId, source, dirty]);

  useEffect(() => {
    return () => {
      dirtyRegistry.set(fileId, source, false);
    };
  }, [fileId, source]);
}
