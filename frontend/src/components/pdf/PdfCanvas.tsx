"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useDocumentContext, usePageContext } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";

import { rasterCacheFor, type Raster } from "@/lib/pdfRasterCache";

/**
 * react-pdf's `customRenderer`: the page's picture comes from the document's
 * raster cache instead of react-pdf's own canvas, which calls
 * `page.cleanup()` before every draw and so re-decodes the page's images on
 * each zoom.
 *
 * The cached canvas itself is put on screen. A canvas can sit in one place
 * only, so a raster already on show in the other viewer is drawn into a
 * canvas of this component's own instead.
 */
export function PdfCanvas() {
  const pageContext = usePageContext();
  const documentContext = useDocumentContext();
  const owner = `canvas:${useId()}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<Raster | null>(null);
  const copyRef = useRef<HTMLCanvasElement | null>(null);
  const [copyFailed, setCopyFailed] = useState<Raster | null>(null);
  const [onScreen, setOnScreen] = useState<Raster | null>(null);

  const page = pageContext?.page as PDFPageProxy | undefined;
  const pdf = documentContext?.pdf;
  const cache = pdf ? rasterCacheFor(pdf) : null;
  const scale = pageContext?.scale ?? 1;
  const renderScale =
    scale *
    (pageContext?.devicePixelRatio ??
      (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const pageNumber = page?.pageNumber ?? 0;

  const subscribe = cache?.subscribe ?? noopSubscribe;
  const getVersion = cache?.getVersion ?? zero;
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const exact = cache?.get(pageNumber, renderScale);
  const previous =
    shownRef.current && shownRef.current.canvas.width > 0
      ? shownRef.current
      : undefined;
  const shown = exact ?? previous ?? cache?.best(pageNumber);
  const error = cache?.error(pageNumber, renderScale);

  const heldScale = shown && shown !== exact ? shown.renderScale : null;
  useEffect(() => {
    if (!cache || !pageNumber) return;
    cache.want(owner, {
      visible: [{ pageNumber, renderScale }],
      hold: heldScale === null ? [] : [{ pageNumber, renderScale: heldScale }],
    });
  }, [cache, owner, pageNumber, renderScale, heldScale]);
  useEffect(() => {
    if (!cache) return;
    return () => cache.release(owner);
  }, [cache, owner]);

  const viewport = page?.getViewport({ scale, rotation: pageContext?.rotate });
  const cssWidth = viewport ? `${Math.floor(viewport.width)}px` : "0px";
  const cssHeight = viewport ? `${Math.floor(viewport.height)}px` : "0px";
  const className = `${pageContext?._className ?? "react-pdf__Page"}__canvas`;

  useLayoutEffect(() => {
    const host = hostRef.current;
    shownRef.current = shown ?? null;
    if (!host) return;
    if (!shown) {
      host.replaceChildren();
      setOnScreen(null);
      return;
    }
    const target = shown.canvas;
    const takenElsewhere = target.isConnected && target.parentElement !== host;
    let element: HTMLCanvasElement;
    if (!takenElsewhere) {
      releaseCopy(copyRef);
      element = target;
    } else {
      const copy = copyRef.current ?? document.createElement("canvas");
      copyRef.current = copy;
      copy.width = target.width;
      copy.height = target.height;
      const context = copy.getContext("2d");
      if (!context) {
        releaseCopy(copyRef);
        host.replaceChildren();
        setCopyFailed(shown);
        setOnScreen(null);
        return;
      }
      context.drawImage(target, 0, 0);
      element = copy;
    }
    element.className = className;
    element.dir = "ltr";
    Object.assign(element.style, {
      display: "block",
      userSelect: "none",
      width: cssWidth,
      height: cssHeight,
    });
    if (host.firstChild !== element) host.replaceChildren(element);
    setCopyFailed(null);
    setOnScreen(shown);
  }, [shown, className, cssWidth, cssHeight]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    return () => {
      // The cached canvas goes back to the cache, not to the collector.
      host?.replaceChildren();
      releaseCopy(copyRef);
    };
  }, []);

  const failed = error ?? (copyFailed && copyFailed === exact ? COPY_FAILED : null);
  const { onRenderSuccess, onRenderError } = pageContext ?? {};
  useEffect(() => {
    if (!page || !viewport) return;
    if (failed) {
      onRenderError?.(failed instanceof Error ? failed : new Error(String(failed)));
    } else if (exact && onScreen === exact) {
      // Defined, not assigned: react-pdf gives the shared page proxy
      // getter-only `width` / `height`, which an assignment through the
      // prototype chain throws on.
      onRenderSuccess?.(
        Object.create(page, {
          width: { value: viewport.width },
          height: { value: viewport.height },
          originalWidth: { value: viewport.width / scale },
          originalHeight: { value: viewport.height / scale },
        }),
      );
    }
    // Once per outcome, not on every change of the callbacks' identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exact, failed, onScreen]);

  if (!page) return null;

  return (
    <div
      ref={hostRef}
      style={{
        width: cssWidth,
        height: cssHeight,
        visibility: shown && !copyFailed ? undefined : "hidden",
      }}
    />
  );
}

const COPY_FAILED = new Error("The browser refused a canvas for this page.");

function releaseCopy(ref: { current: HTMLCanvasElement | null }) {
  if (!ref.current) return;
  ref.current.width = 0;
  ref.current.height = 0;
  ref.current = null;
}

const noopSubscribe = () => () => {};
const zero = () => 0;
