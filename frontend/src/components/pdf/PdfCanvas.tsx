"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useDocumentContext, usePageContext } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";

import { rasterCacheFor } from "@/lib/pdfRasterCache";

/**
 * react-pdf's `customRenderer`: the page's picture comes from the document's
 * raster cache instead of react-pdf's own canvas, which calls
 * `page.cleanup()` before every draw and so re-decodes the page's images on
 * each zoom.
 *
 * The canvas here is a copy of the cached one, not the cached one itself, so
 * two viewers of the same page at the same size never take a picture from
 * each other.
 */
export function PdfCanvas() {
  const pageContext = usePageContext();
  const documentContext = useDocumentContext();
  const owner = `canvas:${useId()}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const page = pageContext?.page as PDFPageProxy | undefined;
  const pdf = documentContext?.pdf;
  const cache = pdf ? rasterCacheFor(pdf) : null;
  const scale = pageContext?.scale ?? 1;
  const renderScale =
    scale *
    (pageContext?.devicePixelRatio ??
      (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const pageNumber = page?.pageNumber ?? 0;

  useEffect(() => {
    if (!cache || !pageNumber) return;
    cache.want(owner, { visible: [{ pageNumber, renderScale }] });
    return () => cache.release(owner);
  }, [cache, owner, pageNumber, renderScale]);

  const subscribe = cache?.subscribe ?? noopSubscribe;
  const getVersion = cache?.getVersion ?? zero;
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const exact = cache?.get(pageNumber, renderScale);
  const shown = exact ?? cache?.best(pageNumber);
  const error = cache?.error(pageNumber, renderScale);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shown) return;
    canvas.width = shown.canvas.width;
    canvas.height = shown.canvas.height;
    canvas.getContext("2d")?.drawImage(shown.canvas, 0, 0);
  }, [shown]);

  const { onRenderSuccess, onRenderError } = pageContext ?? {};
  useEffect(() => {
    if (!page) return;
    if (exact) {
      const viewport = page.getViewport({ scale });
      onRenderSuccess?.(
        Object.assign(Object.create(page), {
          width: viewport.width,
          height: viewport.height,
          originalWidth: viewport.width / scale,
          originalHeight: viewport.height / scale,
        }),
      );
    } else if (error) {
      onRenderError?.(error instanceof Error ? error : new Error(String(error)));
    }
    // Once per outcome, not on every change of the callbacks' identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exact, error]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  if (!page) return null;
  const viewport = page.getViewport({ scale, rotation: pageContext?.rotate });

  return (
    <canvas
      ref={canvasRef}
      className={`${pageContext?._className ?? "react-pdf__Page"}__canvas`}
      dir="ltr"
      style={{
        display: "block",
        userSelect: "none",
        width: `${Math.floor(viewport.width)}px`,
        height: `${Math.floor(viewport.height)}px`,
        visibility: shown ? undefined : "hidden",
      }}
    />
  );
}

const noopSubscribe = () => () => {};
const zero = () => 0;
