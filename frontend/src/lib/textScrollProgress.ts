"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { getWatchProgress, saveWatchProgress } from "./api";
import { getSavedPlayback, saveProgress } from "./recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

export const TEXT_SCROLL_SAVE_DELAY_MS = 1000;
export const TEXT_SCROLL_DURATION = 1000;

const MIN_POSITION = 50;
const MAX_RESTORE_POSITION = 900;

/**
 * The file the text being rendered belongs to. MarkdownPreview has no file id
 * of its own, and its props are shared with callers that show text which is
 * not a file (an addon editor, an LLM answer).
 */
export const TextScrollFileIdContext = createContext<string | null>(null);

export interface UseTextScrollProgressOptions {
  /** Null while the rendered text belongs to another file, or to none yet. */
  fileId: string | null;
  /** The rendered text; its nearest scrollable ancestor is the scroll host. */
  targetRef: RefObject<HTMLElement | null>;
  /** A highlight from the page already chose where the reader lands. */
  hasExplicitTarget?: boolean;
}

interface PendingSave {
  fileId: string;
  position: number;
}

interface Session {
  fileId: string;
  restoreStarted: boolean;
}

function scrollHostOf(element: HTMLElement): HTMLElement | null {
  for (
    let node: HTMLElement | null = element;
    node !== null;
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return node;
    }
  }
  return null;
}

function isTwoScreens(host: HTMLElement): boolean {
  return host.clientHeight > 0 && host.scrollHeight >= 2 * host.clientHeight;
}

/**
 * Stores the scroll fraction of a long text in WatchHistory's position and
 * 1000 in its duration, as PDF stores its page, so the continue-watching gate
 * reads a document the same way.
 */
export function useTextScrollProgress({
  fileId,
  targetRef,
  hasExplicitTarget = false,
}: UseTextScrollProgressOptions): void {
  const { nickname } = useProfile();
  const hasProfileRef = useRef(nickname !== null);
  hasProfileRef.current = nickname !== null;
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const explicitTargetRef = useRef(hasExplicitTarget);
  explicitTargetRef.current = hasExplicitTarget;

  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /** The read in flight; clearing it abandons that read. */
  const readRef = useRef<object | null>(null);
  const movedWhileReadingRef = useRef(false);
  /** `scrollTop` the restore produced; an event there is not the reader's. */
  const restoredTopRef = useRef<number | null>(null);

  const write = useCallback((save: PendingSave) => {
    if (hasProfileRef.current) {
      saveWatchProgress(
        save.fileId,
        save.position,
        TEXT_SCROLL_DURATION,
      ).catch(() => {
        // Fire-and-forget: a lost marker must not disturb reading.
      });
    } else {
      saveProgress(save.fileId, save.position, TEXT_SCROLL_DURATION);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(() => {
    cancel();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) write(pending);
  }, [cancel, write]);

  useEffect(() => {
    return () => {
      flush();
      sessionRef.current = null;
      readRef.current = null;
      movedWhileReadingRef.current = false;
      restoredTopRef.current = null;
    };
  }, [fileId, flush]);

  useEffect(() => {
    if (fileId === null) return;
    const target = targetRef.current;
    if (!target) return;
    const host = scrollHostOf(target);
    if (!host) return;

    if (sessionRef.current?.fileId !== fileId) {
      sessionRef.current = { fileId, restoreStarted: false };
    }

    const onScroll = () => {
      const restored = restoredTopRef.current;
      if (restored !== null && host.scrollTop === restored) return;
      if (restored !== null) restoredTopRef.current = null;

      if (readRef.current !== null) {
        movedWhileReadingRef.current = true;
      }

      const range = host.scrollHeight - host.clientHeight;
      if (range <= 0 || !isTwoScreens(host)) return;
      const position = Math.round((host.scrollTop / range) * 1000);
      if (position < MIN_POSITION) return;

      pendingRef.current = { fileId, position };
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) write(pending);
      }, TEXT_SCROLL_SAVE_DELAY_MS);
    };

    host.addEventListener("scroll", onScroll, { passive: true });

    const session = sessionRef.current;
    if (session && !session.restoreStarted) {
      session.restoreStarted = true;
      if (!explicitTargetRef.current && window.location.hash === "") {
        const token = {};
        readRef.current = token;
        const read = hasProfileRef.current
          ? getWatchProgress(fileId)
          : Promise.resolve(getSavedPlayback(fileId));
        read
          .then((saved) => {
            if (readRef.current !== token) return;
            readRef.current = null;
            if (movedWhileReadingRef.current) {
              movedWhileReadingRef.current = false;
              flush();
              return;
            }
            if (explicitTargetRef.current || window.location.hash !== "") return;
            if (saved.duration !== TEXT_SCROLL_DURATION) return;
            if (!Number.isFinite(saved.position)) return;
            if (
              saved.position < MIN_POSITION ||
              saved.position >= MAX_RESTORE_POSITION
            ) {
              return;
            }
            if (!isTwoScreens(host)) return;
            const range = host.scrollHeight - host.clientHeight;
            if (range <= 0) return;

            host.scrollTop = Math.round(
              (saved.position / TEXT_SCROLL_DURATION) * range,
            );
            restoredTopRef.current = host.scrollTop;
          })
          .catch(() => {
            if (readRef.current !== token) return;
            readRef.current = null;
            movedWhileReadingRef.current = false;
          });
      }
    }

    return () => {
      host.removeEventListener("scroll", onScroll);
    };
  }, [fileId, cancel, flush, targetRef, write]);
}
