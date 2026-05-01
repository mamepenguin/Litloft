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

/**
 * Loads & manages the Smart Folder list for a single drive. The list is
 * scoped per drive: switching drives discards the previous list and
 * refetches.
 */
export function useSmartFolders(drive: string | null): UseSmartFoldersResult {
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const driveRef = useRef<string | null>(drive);

  const fetchList = useCallback(
    async (target: string | null) => {
      if (!target) {
        setSmartFolders([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await getSmartFolders(target);
        // Drop the response if the drive changed mid-flight.
        if (driveRef.current !== target) return;
        setSmartFolders(list);
      } catch (e) {
        if (driveRef.current !== target) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setSmartFolders([]);
      } finally {
        if (driveRef.current === target) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    driveRef.current = drive;
    void fetchList(drive);
  }, [drive, fetchList]);

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
      return created;
    },
    [],
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
      return updated;
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      const target = driveRef.current;
      if (!target) {
        throw new Error("No drive selected");
      }
      await deleteSmartFolderApi(target, id);
      setSmartFolders((prev) => prev.filter((sf) => sf.id !== id));
    },
    [],
  );

  return { smartFolders, loading, error, refetch, create, update, remove };
}
