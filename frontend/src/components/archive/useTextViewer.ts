"use client";

import { useEffect, useState } from "react";

import { getArchiveEntryUrl } from "@/lib/api";
import type { ArchiveEntry } from "@/types";
import type { ArchiveViewMode } from "./archiveUtils";

interface TextViewerResult {
  textContent: string | null;
  setTextContent: React.Dispatch<React.SetStateAction<string | null>>;
  textLoading: boolean;
  textError: string | null;
  setTextError: React.Dispatch<React.SetStateAction<string | null>>;
  textConfirmed: boolean;
  setTextConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTextViewer(
  viewMode: ArchiveViewMode,
  viewingEntry: ArchiveEntry | null,
  fileId: string
): TextViewerResult {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [textConfirmed, setTextConfirmed] = useState(false);

  // Text viewer: load content
  useEffect(() => {
    if (viewMode !== "text" || !viewingEntry || !textConfirmed) return;

    let cancelled = false;
    setTextLoading(true);
    setTextError(null);

    fetch(getArchiveEntryUrl(fileId, viewingEntry.path), {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch((err) => {
        if (!cancelled)
          setTextError(
            err instanceof Error ? err.message : "Failed to load"
          );
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, viewingEntry, fileId, textConfirmed]);

  return {
    textContent,
    setTextContent,
    textLoading,
    textError,
    setTextError,
    textConfirmed,
    setTextConfirmed,
  };
}
