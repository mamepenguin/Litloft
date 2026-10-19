"use client";

import { useEffect, useState } from "react";

import { getFileRelations, type FileRelationItem } from "@/lib/api";

interface Loaded {
  fileId: string;
  relations: FileRelationItem[];
}

/** `null` until this file's relations have been answered. */
export function useFileRelations(fileId: string): FileRelationItem[] | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    let request: Promise<FileRelationItem[]>;
    try {
      request = getFileRelations(fileId).then((res) => res.relations);
    } catch (error) {
      request = Promise.reject(error);
    }
    request
      .catch(() => [])
      .then((relations) => {
        if (!cancelled) setLoaded({ fileId, relations });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return loaded?.fileId === fileId ? loaded.relations : null;
}
