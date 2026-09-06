"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { PdfController, PdfDocumentState } from "@/lib/pdfController";

/**
 * The store's state, or the state of a document nobody has opened.
 *
 * The shell asks this before it has a controller — a Markdown note has none
 * and never will — so the empty answer is a value rather than a branch at
 * every call site. Held constant so `useSyncExternalStore`'s identity check
 * does not see a new object on every render.
 */
const NO_DOCUMENT: PdfDocumentState = { src: "", numPages: 0, page: 1, outline: null };

export function usePdfState(controller: PdfController | null): PdfDocumentState {
  // Stable per controller — see the note in `archive/useArchiveState.ts`.
  // Both files had the same inline-arrow shape; fixed together so the
  // pair does not drift.
  const subscribe = useCallback(
    (listener: () => void) => controller?.subscribe(listener) ?? (() => {}),
    [controller],
  );
  const snapshot = useCallback(
    () => controller?.getState() ?? NO_DOCUMENT,
    [controller],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
