"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { MediaController } from "@/lib/mediaController";
import type { DocumentController } from "@/lib/documentController";
import { canTakeFindShortcut } from "@/lib/findShortcut";
import { fetchFileFind, type FindRow } from "@/lib/fileFind";
import { useImeKeyGuard } from "@/lib/ime";
import { rowsForCategory, categoryOf } from "./categories";
import type {
  FindCategory,
  FindReportInstance,
  FindStatus,
  FindTabRequest,
} from "./types";

const DEBOUNCE_MS = 300;
const QUERY_MAX = 200;

export interface UseFindInFileOptions {
  fileId: string;
  drive: string;
  enabled: boolean;
  isMobile: boolean;
  initialFind?: string;
  mediaController: MediaController | null;
  documentController: DocumentController | null;
}

function normaliseInitial(value: string | undefined): string {
  if (value === undefined) return "";
  return value.trim().slice(0, QUERY_MAX);
}

export function useFindInFile({
  fileId,
  drive,
  enabled,
  isMobile,
  initialFind,
  mediaController,
  documentController,
}: UseFindInFileOptions) {
  const ime = useImeKeyGuard();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FindStatus>({ kind: "idle" });
  const [filter, setFilter] = useState<FindCategory>("all");
  const [currentRow, setCurrentRow] = useState<FindRow | null>(null);
  const currentRowRef = useRef<FindRow | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [selectRequest, setSelectRequest] = useState<FindTabRequest | null>(null);

  const openRef = useRef(false);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestSeqRef = useRef(0);
  const fetchingRef = useRef(false);
  const pendingStepRef = useRef<"next" | "prev" | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mediaRef = useRef(mediaController);
  mediaRef.current = mediaController;
  const documentRef = useRef(documentController);
  documentRef.current = documentController;
  const reportedRef = useRef<Record<FindReportInstance, string | null>>({
    pane: null,
    sheet: null,
  });
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const rememberedTabRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const appliedInitialRef = useRef(false);
  const urlStripRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAnswer = useCallback(() => {
    clearTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    latestSeqRef.current += 1;
    fetchingRef.current = false;
    pendingStepRef.current = null;
    setStatus({ kind: "idle" });
    setFilter("all");
    currentRowRef.current = null;
    setCurrentRow(null);
  }, [clearTimer]);

  const jump = useCallback((row: FindRow) => {
    switch (row.kind) {
      case "utterance":
      case "scene":
        if (typeof row.start === "number") mediaRef.current?.seek(row.start);
        return;
      case "page":
        if (typeof row.page === "number") {
          documentRef.current?.goTo({ page: row.page });
        }
        return;
      case "section":
        if (typeof row.section === "number") {
          documentRef.current?.goTo({ section: row.section });
        }
        return;
      default:
        return;
    }
  }, []);

  const makeCurrent = useCallback(
    (row: FindRow) => {
      currentRowRef.current = row;
      setCurrentRow(row);
      jump(row);
    },
    [jump],
  );

  const requestTab = useCallback((tabId: string) => {
    requestSeqRef.current += 1;
    setSelectRequest({ tabId, seq: requestSeqRef.current });
  }, []);

  const runFetch = useCallback(
    (value: string) => {
      const term = value.trim().slice(0, QUERY_MAX);
      clearTimer();
      abortRef.current?.abort();
      if (!term || !enabledRef.current) {
        latestSeqRef.current += 1;
        fetchingRef.current = false;
        setStatus({ kind: "idle" });
        currentRowRef.current = null;
        setCurrentRow(null);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = latestSeqRef.current + 1;
      latestSeqRef.current = seq;
      fetchingRef.current = true;
      setStatus({ kind: "pending" });
      setFilter("all");
      currentRowRef.current = null;
      setCurrentRow(null);

      void fetchFileFind(fileId, term, drive, controller.signal).then((result) => {
        if (seq !== latestSeqRef.current) return;
        if (result.kind === "aborted") return;
        fetchingRef.current = false;
        const step = pendingStepRef.current;
        pendingStepRef.current = null;
        if (result.kind === "unavailable") {
          setStatus({ kind: "unavailable" });
          return;
        }
        if (result.kind === "failed") {
          setStatus({ kind: "failed" });
          return;
        }
        const answer = result.answer;
        if (!answer.indexed) {
          setStatus({ kind: "notIndexed" });
          return;
        }
        if (answer.total === 0) {
          setStatus({ kind: "noHits" });
          return;
        }
        setStatus({ kind: "hits", answer });
        if (step && answer.rows.length > 0) {
          const row =
            step === "next" ? answer.rows[0] : answer.rows[answer.rows.length - 1];
          makeCurrent(row);
        }
      });
    },
    [clearTimer, drive, fileId, makeCurrent],
  );

  const scheduleFetch = useCallback(
    (value: string) => {
      const term = value.trim().slice(0, QUERY_MAX);
      if (!term) {
        clearAnswer();
        return;
      }
      clearTimer();
      setStatus({ kind: "pending" });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runFetch(term);
      }, DEBOUNCE_MS);
    },
    [clearAnswer, clearTimer, runFetch],
  );

  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      if (composingRef.current) return;
      const term = value.trim();
      clearAnswer();
      if (!term) return;
      scheduleFetch(value);
    },
    [clearAnswer, scheduleFetch],
  );

  const compositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const compositionEnd = useCallback(() => {
    composingRef.current = false;
    ime.onCompositionEnd();
  }, [ime]);

  const commitQuery = useCallback(
    (value: string) => {
      setQuery(value);
      const term = value.trim();
      clearAnswer();
      if (!term) return;
      scheduleFetch(value);
    },
    [clearAnswer, scheduleFetch],
  );

  useEffect(() => {
    if (!open) return;
    return () => {
      abortRef.current?.abort();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [open]);

  const currentReportedTab = useCallback(
    () => (isMobileRef.current ? reportedRef.current.sheet : reportedRef.current.pane),
    [],
  );

  const openWithQuery = useCallback(
    (value: string) => {
      if (!enabledRef.current) return;
      const wasOpen = openRef.current;
      if (!wasOpen) {
        rememberedTabRef.current = currentReportedTab();
      }
      openRef.current = true;
      setOpen(true);
      setFocusNonce((n) => n + 1);
      requestTab("find");
      if (wasOpen) return;
      setQuery(value);
      runFetch(value);
    },
    [currentReportedTab, requestTab, runFetch],
  );

  const openFind = useCallback(() => {
    openWithQuery(query);
  }, [openWithQuery, query]);

  const closeFind = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    clearAnswer();
    const reported = currentReportedTab();
    const remembered = rememberedTabRef.current;
    rememberedTabRef.current = null;
    if (reported === "find" && remembered) requestTab(remembered);
    urlStripRef.current?.();
  }, [
    clearAnswer,
    currentReportedTab,
    requestTab,
  ]);

  const openFindByShortcut = useCallback(() => {
    if (!enabledRef.current) return false;
    if (!canTakeFindShortcut()) return false;
    openWithQuery(query);
    return true;
  }, [openWithQuery, query]);

  const step = useCallback(
    (direction: "next" | "prev") => {
      if (status.kind !== "hits") return;
      const visible = rowsForCategory(status.answer.rows, filter);
      if (visible.length === 0) return;
      const current = currentRowRef.current;
      const at = current ? visible.indexOf(current) : -1;
      let nextIndex: number;
      if (at < 0) nextIndex = direction === "next" ? 0 : visible.length - 1;
      else
        nextIndex =
          (at + (direction === "next" ? 1 : -1) + visible.length) % visible.length;
      makeCurrent(visible[nextIndex]);
    },
    [filter, makeCurrent, status],
  );

  const selectRow = useCallback(
    (row: FindRow) => {
      makeCurrent(row);
    },
    [makeCurrent],
  );

  const selectFilter = useCallback(
    (category: FindCategory) => {
      setFilter(category);
      const current = currentRowRef.current;
      if (current && category !== "all" && categoryOf(current.kind) !== category) {
        currentRowRef.current = null;
        setCurrentRow(null);
      }
    },
    [],
  );

  const retry = useCallback(() => {
    runFetch(query);
  }, [query, runFetch]);

  const keyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (ime.isImeKeystroke(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeFind();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const direction = event.shiftKey ? "prev" : "next";
      if (status.kind === "pending") {
        if (timerRef.current !== null && !fetchingRef.current) {
          clearTimer();
          runFetch(query);
        }
        pendingStepRef.current = direction;
        return;
      }
      if (status.kind === "hits") step(direction);
    },
    [clearTimer, closeFind, ime, query, runFetch, status.kind, step],
  );

  const reportTab = useCallback((instance: FindReportInstance, tabId: string) => {
    reportedRef.current[instance] = tabId;
  }, []);

  const registerUrlStrip = useCallback((fn: (() => void) | null) => {
    urlStripRef.current = fn;
  }, []);

  useEffect(() => {
    if (appliedInitialRef.current) return;
    if (!enabled) return;
    appliedInitialRef.current = true;
    const value = normaliseInitial(initialFind);
    if (!value) return;
    openWithQuery(value);
  }, [enabled, initialFind, openWithQuery]);

  const rows = useMemo(
    () => (status.kind === "hits" ? status.answer.rows : []),
    [status],
  );
  const visibleRows = useMemo(() => rowsForCategory(rows, filter), [rows, filter]);
  const currentIndex = currentRow ? visibleRows.indexOf(currentRow) : -1;
  const truncated = status.kind === "hits" && status.answer.truncated;

  return {
    enabled,
    shortcutEnabled: enabled && !isMobile,
    open,
    query,
    status,
    filter,
    rows,
    visibleRows,
    currentRow,
    currentIndex: currentIndex < 0 ? null : currentIndex,
    truncated,
    focusNonce,
    selectRequest,
    openFind,
    closeFind,
    openFindByShortcut,
    changeQuery,
    commitQuery,
    compositionStart,
    compositionEnd,
    keyDown,
    step,
    selectRow,
    selectFilter,
    retry,
    reportTab,
    registerUrlStrip,
  };
}
