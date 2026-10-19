"use client";

import { useEffect, useMemo, type RefObject } from "react";

import {
  DocumentCaptureStore,
  readDocumentSelection,
  type DocumentCaptureController,
} from "@/lib/documentCapture";

export function useDocumentCapturePublisher(
  rootRef: RefObject<HTMLElement | null>,
  onController: ((controller: DocumentCaptureController | null) => void) | undefined,
  options: { includeHeading?: boolean; includePdfPage?: boolean } = {},
): DocumentCaptureStore {
  const store = useMemo(() => new DocumentCaptureStore(), []);
  const includeHeading = options.includeHeading ?? false;
  const includePdfPage = options.includePdfPage ?? false;

  useEffect(() => {
    if (!onController) return;
    onController(store);
    return () => onController(null);
  }, [onController, store]);

  useEffect(() => {
    if (!onController) return;
    const update = () => {
      const root = rootRef.current;
      store.setCapture(
        root
          ? readDocumentSelection(root, window.getSelection(), {
              includeHeading,
              includePdfPage,
            })
          : null,
      );
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [
    onController,
    includeHeading,
    includePdfPage,
    rootRef,
    store,
  ]);

  return store;
}
