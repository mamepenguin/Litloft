"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { PdfController, PdfDocumentState } from "@/lib/pdfController";

/**
 * Held constant so `useSyncExternalStore`'s identity check
 * does not see a new object on every render.
 */
const NO_DOCUMENT: PdfDocumentState = { src: "", numPages: 0, page: 1, outline: null };

export function usePdfState(controller: PdfController | null): PdfDocumentState {
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
