"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** How long an abandoned edit's reason stays on screen. */
const ERROR_TTL_MS = 3000;

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
  commit: (run: () => Promise<unknown>) => Promise<void>;
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

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const start = useCallback((path: string) => {
    clearTimer();
    setError(null);
    setEditingPath(path);
  }, []);

  const cancel = useCallback((reason?: string) => {
    setEditingPath(null);
    if (!reason) return;
    setError(reason);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setError(null);
    }, ERROR_TTL_MS);
  }, []);

  const commit = useCallback(
    async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (cause) {
        // Rethrown, not swallowed: the editor distinguishes an active
        // confirmation (stay open, show this) from a click-away (let go).
        throw new Error(describeFailure(cause, t));
      }
      setEditingPath(null);
      onRenamed();
    },
    [onRenamed, t],
  );

  return { editingPath, error, start, cancel, commit };
}
