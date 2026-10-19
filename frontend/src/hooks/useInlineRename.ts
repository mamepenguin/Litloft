"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useCurrentDrive } from "@/components/CurrentDriveProvider";

const ERROR_TTL_MS = 3000;

/**
 * Focus is handed back by looking the row up again rather than by keeping
 * a reference to it: a successful rename refreshes the list, so the
 * element that had focus is gone and a new one takes its place. These
 * bound the wait for that new element.
 */
const REFOCUS_POLL_MS = 50;
const REFOCUS_ATTEMPTS = 20;

export const RENAME_FOCUS_ATTR = "data-rename-focus";

type Translate = (key: string) => string;

function describeFailure(cause: unknown, t: Translate): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const status = raw.match(/\b(\d{3})\b/)?.[1];
  switch (status) {
    case "409":
      return t("error.conflict");
    case "403":
      return t("error.readOnly");
    case "404":
      return t("error.notFound");
    default:
      return t("error.failed");
  }
}

export interface InlineRenameApi {
  editingPath: string | null;
  error: string | null;
  start: (path: string) => void;
  cancel: (error?: string) => void;
  commit: (run: () => Promise<unknown>, focusAfter?: string) => Promise<void>;
}

export function useInlineRename(onRenamed: () => void): InlineRenameApi {
  const t = useTranslations("inlineRename");
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingPathRef = useRef<string | null>(null);
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * An edit can be abandoned by the unmount itself: tearing down a focused
   * editor fires blur, and the `cancel` that follows arrives *after* this
   * hook's cleanup has run, arming a fresh poll nothing owns.
   */
  const aliveRef = useRef(true);

  useEffect(() => {
    editingPathRef.current = editingPath;
  }, [editingPath]);

  const refocus = useCallback((path: string) => {
    if (!aliveRef.current) return;
    if (refocusTimerRef.current !== null) {
      clearTimeout(refocusTimerRef.current);
      refocusTimerRef.current = null;
    }
    let attempts = 0;
    const tryFocus = () => {
      refocusTimerRef.current = null;
      if (!aliveRef.current) return;
      const selector = `[${RENAME_FOCUS_ATTR}="${CSS.escape(path)}"]`;
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        el.focus();
        return;
      }
      // The list may still be refetching after a successful rename.
      if (++attempts >= REFOCUS_ATTEMPTS) return;
      refocusTimerRef.current = setTimeout(tryFocus, REFOCUS_POLL_MS);
    };
    tryFocus();
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => {
    // Set on the way in as well as cleared on the way out: StrictMode runs
    // mount -> cleanup -> mount while keeping the refs, so a flag only ever
    // cleared would stay false for the rest of the component's life and
    // silence every later refocus.
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      if (refocusTimerRef.current !== null) clearTimeout(refocusTimerRef.current);
    };
  }, []);

  const drive = useCurrentDrive();
  useEffect(() => {
    clearTimer();
    setError(null);
  }, [drive]);

  const start = useCallback((path: string) => {
    clearTimer();
    setError(null);
    setEditingPath(path);
  }, []);

  const cancel = useCallback(
    (reason?: string) => {
    const from = editingPathRef.current;
    setEditingPath(null);
    if (from !== null) refocus(from);
    if (!reason || !aliveRef.current) return;
    setError(reason);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setError(null);
    }, ERROR_TTL_MS);
    },
    [refocus],
  );

  const commit = useCallback(
    async (run: () => Promise<unknown>, focusAfter?: string) => {
      try {
        await run();
      } catch (cause) {
        // Rethrown, not swallowed: the editor distinguishes an active
        // confirmation (stay open, show this) from a click-away (let go).
        throw new Error(describeFailure(cause, t));
      }
      setEditingPath(null);
      onRenamed();
      // The row comes back under its new path, so focus is restored by
      // that rather than by the path the edit started from.
      if (focusAfter !== undefined) refocus(focusAfter);
    },
    [onRenamed, t, refocus],
  );

  return { editingPath, error, start, cancel, commit };
}
