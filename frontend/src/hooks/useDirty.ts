"use client";

import { useEffect } from "react";

import {
  type DirtySource,
  dirtyRegistry,
} from "@/lib/dirtyRegistry";

interface UseDirtyOpts {
  /** File whose dirty state this contributor is reporting. */
  fileId: string;
  /** Why the file is dirty — e.g. ``"knowledge-editor"``. */
  source: DirtySource;
  /** Whether the contributor currently holds unsaved changes. */
  dirty: boolean;
}

/**
 * Publish a single contributor's dirty status into the global
 * ``dirtyRegistry``. The hook is intentionally write-only — readers
 * (``useFileNav`` guard, ``beforeunload`` handler, confirmation
 * dialog) reach for ``useIsDirty`` or call ``dirtyRegistry`` directly.
 *
 * The cleanup effect releases the lock on unmount and on fileId
 * change so a navigation that re-mounts ``<Editor>`` for a different
 * file never leaks a phantom dirty marker for the previous one.
 */
export function useDirty({ fileId, source, dirty }: UseDirtyOpts): void {
  useEffect(() => {
    dirtyRegistry.set(fileId, source, dirty);
  }, [fileId, source, dirty]);

  useEffect(() => {
    return () => {
      // Always clear on unmount / fileId-change; an unmounted editor
      // cannot still be holding unsaved changes from the user's
      // perspective.
      dirtyRegistry.set(fileId, source, false);
    };
  }, [fileId, source]);
}
