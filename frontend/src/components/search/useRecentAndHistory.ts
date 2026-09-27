"use client";

import { useCallback, useEffect, useState } from "react";

import { getWatchHistory } from "@/lib/api";
import type { FileKind, WatchHistoryItem } from "@/types";
import { addToHistory, getHistory, removeFromHistory } from "./searchHistory";

const RECENT_FILE_LIMIT = 8;

interface RecentData {
  drive: string;
  type: FileKind | null;
  items: WatchHistoryItem[];
}

export interface RecentAndHistory {
  recentFiles: WatchHistoryItem[];
  /** Replaced on every reply, including one with the same files. */
  recentReply: RecentData | null;
  history: string[];
  record: (term: string) => void;
  forget: (term: string) => void;
}

/** What the empty modal offers: recently opened files and recent search terms. */
export function useRecentAndHistory(
  open: boolean,
  drive: string | null,
  scopeType: FileKind | null,
): RecentAndHistory {
  const [historyData, setHistoryData] = useState<{
    drive: string;
    terms: string[];
  } | null>(null);
  const [recentData, setRecentData] = useState<RecentData | null>(null);

  // `filter: "all"` is required — the default `unfinished` applies a 90%
  // completion gate meant for continue-watching.
  //
  // The loaded files are stored with the drive they came from. GlobalSearch
  // survives drive navigation, so a bare array would keep showing files from
  // the drive they just left until the next request landed, and a drive is a
  // security boundary.
  useEffect(() => {
    if (!open || !drive) {
      setRecentData(null);
      return;
    }
    let cancelled = false;
    const request = scopeType
      ? getWatchHistory(drive, RECENT_FILE_LIMIT, "all", scopeType)
      : getWatchHistory(drive, RECENT_FILE_LIMIT, "all");
    request
      .then((items) => {
        if (!cancelled) setRecentData({ drive, type: scopeType, items });
      })
      .catch(() => {
        if (!cancelled) setRecentData({ drive, type: scopeType, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, drive, scopeType]);

  useEffect(() => {
    if (open && drive) setHistoryData({ drive, terms: getHistory(drive) });
  }, [open, drive]);

  const history = historyData?.drive === drive ? historyData.terms : [];

  const recentFiles =
    recentData && recentData.drive === drive && recentData.type === scopeType
      ? recentData.items
      : [];

  const record = useCallback(
    (term: string) => {
      try {
        if (drive) setHistoryData({ drive, terms: addToHistory(drive, term) });
      } catch {
      }
    },
    [drive],
  );

  const forget = useCallback(
    (term: string) => {
      if (drive) setHistoryData({ drive, terms: removeFromHistory(drive, term) });
    },
    [drive],
  );

  return { recentFiles, recentReply: recentData, history, record, forget };
}
