"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** How long an abandoned edit's reason stays on screen. */
const ERROR_TTL_MS = 3000;

/**
 * Focus is handed back by looking the row up again rather than by keeping
 * a reference to it: a successful rename refreshes the list, so the
 * element that had focus is gone and a new one takes its place. These
 * bound the wait for that new element.
 */
const REFOCUS_POLL_MS = 50;
const REFOCUS_ATTEMPTS = 20;

/**
 * Marks the focusable element of a renameable row or card. Both
 * `FolderTreeRow` and `FolderCard` carry it so this hook can restore
 * focus without knowing either shape.
 */
export const RENAME_FOCUS_ATTR = "data-rename-focus";

type Translate = (key: string) => string;

/**
 * `lib/api` rejects with `Error("API error: 409 Conflict")` and friends —
 * a transport detail, not something to show a person. Pull the status out
 * and say what it means for a rename.
 */
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
  /** Path of the row currently being edited, or null. */
  editingPath: string | null;
  /** Reason an edit was abandoned, shown transiently. */
  error: string | null;
  start: (path: string) => void;
  /** `error` is set only when a click-away commit was refused. */
  cancel: (error?: string) => void;
  /**
   * Run the rename. Resolves and leaves edit mode on success; rethrows a
   * readable `Error` on failure so {@link InlineNameEditor} can decide
   * whether to keep the field open.
   */
  commit: (run: () => Promise<unknown>, focusAfter?: string) => Promise<void>;
}

/**
 * Edit state shared by the two surfaces that rename in place: tree rows
 * and folder cards. Owning it here keeps the failure vocabulary and the
 * refresh-on-success rule in one place rather than in each pane.
 */
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
   * hook's cleanup has run. Clearing the pending timer there is therefore
   * not enough — the late `cancel` arms a fresh poll nothing owns, and
   * `document.querySelector` below then hands focus to whatever row has
   * taken that path since.
   */
  const aliveRef = useRef(true);

  useEffect(() => {
    editingPathRef.current = editingPath;
  }, [editingPath]);

  /**
   * Hand keyboard focus back to the row the edit came from. Without this
   * every rename drops focus to <body>, which matters most for the F2
   * path: the user arrived by keyboard and would lose their place on each
   * rename.
   */
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
