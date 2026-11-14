"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSmartFolder as createSmartFolderApi,
  deleteSmartFolder as deleteSmartFolderApi,
  getSmartFolders,
  updateSmartFolder as updateSmartFolderApi,
} from "@/lib/api";
import type {
  SmartFolder,
  SmartFolderCreate,
  SmartFolderUpdate,
} from "@/types/smartFolder";

export interface UseSmartFoldersResult {
  smartFolders: SmartFolder[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  create: (payload: SmartFolderCreate) => Promise<SmartFolder>;
  update: (id: string, payload: SmartFolderUpdate) => Promise<SmartFolder>;
  remove: (id: string) => Promise<void>;
}

type WriteListener = (drive: string) => void;

/**
 * Same tab only: another tab learns of a write on its next fetch, and a
 * storage or broadcast channel would drag in a delivery order nothing needs.
 */
const writeListeners = new Map<number, WriteListener>();
let nextInstanceId = 1;

function announceWrite(drive: string, sender: number): void {
  for (const [instanceId, listener] of writeListeners) {
    if (instanceId !== sender) listener(drive);
  }
}

export function useSmartFolders(drive: string | null): UseSmartFoldersResult {
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [instanceId] = useState(() => nextInstanceId++);
  const driveRef = useRef<string | null>(drive);
  // Only the latest request of this instance may write its response: two
  // writes in quick succession leave two fetches in flight.
  const latestFetch = useRef(0);

  const fetchList = useCallback(
    async (target: string | null, fromWrite = false) => {
      if (!target) {
        if (fromWrite) return;
        setSmartFolders([]);
        setLoading(false);
        setError(null);
        return;
      }
      const request = ++latestFetch.current;
      if (!fromWrite) {
        setLoading(true);
        setError(null);
      }
      try {
        const list = await getSmartFolders(target);
        if (driveRef.current !== target || request !== latestFetch.current) return;
        setSmartFolders(list);
      } catch (e) {
        if (driveRef.current !== target || request !== latestFetch.current) return;
        // The write has already succeeded: losing the rows it made the app
        // refetch for is worse than leaving the previous ones on screen.
        if (fromWrite) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setSmartFolders([]);
      } finally {
        if (!fromWrite && driveRef.current === target) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    driveRef.current = drive;
    void fetchList(drive);
  }, [drive, fetchList]);

  useEffect(() => {
    const listener: WriteListener = (written) => {
      if (driveRef.current !== written) return;
      void fetchList(written, true);
    };
    writeListeners.set(instanceId, listener);
    return () => {
      writeListeners.delete(instanceId);
    };
  }, [instanceId, fetchList]);

  const refetch = useCallback(async () => {
    await fetchList(driveRef.current);
  }, [fetchList]);

  const create = useCallback(
    async (payload: SmartFolderCreate) => {
      const target = driveRef.current;
      if (!target) {
        throw new Error("No drive selected");
      }
      const created = await createSmartFolderApi(target, payload);
      setSmartFolders((prev) => [...prev, created]);
      announceWrite(target, instanceId);
      return created;
    },
    [instanceId],
  );

  const update = useCallback(
    async (id: string, payload: SmartFolderUpdate) => {
      const target = driveRef.current;
      if (!target) {
        throw new Error("No drive selected");
      }
      const updated = await updateSmartFolderApi(target, id, payload);
      setSmartFolders((prev) =>
        prev.map((sf) => (sf.id === id ? updated : sf)),
      );
      announceWrite(target, instanceId);
      return updated;
    },
    [instanceId],
  );

  const remove = useCallback(
    async (id: string) => {
      const target = driveRef.current;
      if (!target) {
        throw new Error("No drive selected");
      }
      await deleteSmartFolderApi(target, id);
      setSmartFolders((prev) => prev.filter((sf) => sf.id !== id));
      announceWrite(target, instanceId);
    },
    [instanceId],
  );

  return { smartFolders, loading, error, refetch, create, update, remove };
}
