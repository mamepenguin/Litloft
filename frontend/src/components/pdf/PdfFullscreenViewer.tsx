"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Page } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { AddonSlot } from "@/components/AddonSlot";
import { PdfCanvas } from "@/components/pdf/PdfCanvas";
import { PdfPageInput } from "@/components/pdf/PdfPageInput";
import { usePdfPageBoxes } from "@/components/pdf/usePdfPageBoxes";
import { useAutoHidingChrome } from "@/hooks/useAutoHidingChrome";
import { useInertBackdrop } from "@/hooks/useInertBackdrop";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useSpreadFits } from "@/hooks/useSpreadFits";
import { useSpreadPaging } from "@/hooks/useSpreadPaging";
import { useViewerZoom } from "@/hooks/useViewerZoom";
import { useViewerZoomShortcuts } from "@/hooks/useViewerZoomShortcuts";
import {
  DocumentCaptureStore,
  readDocumentSelection,
} from "@/lib/documentCapture";
import { faceRaster } from "@/lib/pdfFace";
import { rasterCacheFor, type RasterRequest } from "@/lib/pdfRasterCache";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { readSpreadMode, writeSpreadMode } from "@/lib/spreadPreference";
import type { Orientation } from "@/lib/spreadPaging";

const READING_DIRECTION_KEY = "image-viewer:reading-direction";
const RASTER_OWNER = "fullscreen";

function readReadingDirection(): "ltr" | "rtl" {
  try {
    return localStorage.getItem(READING_DIRECTION_KEY) === "rtl" ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}

export interface DocumentSlotProps {
  fileId: string;
  drive: string;
  filename: string;
  fileType: string;
}

export function PdfFullscreenViewer({
  pdf,
  title,
  initialPage,
  slotProps,
  goToPageRef,
  declaredDirection = null,
  onClose,
  onPageTurned,
}: {
  pdf: PDFDocumentProxy;
  /**
   * The document's own `/Direction`. It opens the viewer in that direction,
   * and a switch made here then lasts only as long as the viewer: a reader
   * of one right-to-left manga has not asked for every picture to turn the
   * other way.
   */
  declaredDirection?: "ltr" | "rtl" | null;
  title: string;
  initialPage: number;
  slotProps?: DocumentSlotProps;
  /** Set while open, for a link inside the document that names a page. */
  goToPageRef?: MutableRefObject<((page: number) => void) | null>;
  /** Called with the page the reader was on, 1-based. */
  onClose: (page: number) => void;
  /**
   * Called after the reader turns the page here, with the page `onClose`
   * would hand back. A move made through `goToPageRef` is not reported.
   */
  onPageTurned?: (page: number) => void;
}) {
  const t = useTranslations("file");
  const tg = useTranslations("gallery");
  const tc = useTranslations("common");
  const numPages = pdf.numPages;

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialPage - 1), numPages - 1),
  );
  const [spreadMode, setSpreadMode] = useState(() => readSpreadMode());
  const [readingDirection, setReadingDirection] = useState(
    () => declaredDirection ?? readReadingDirection(),
  );
  const [showRightHalf, setShowRightHalf] = useState(
    () => (declaredDirection ?? readReadingDirection()) === "rtl",
  );

  // A face is entered from its first half in reading order, whichever of
  // the two switches changed.
  useEffect(() => {
    writeSpreadMode(spreadMode);
    setShowRightHalf(readingDirection === "rtl");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadMode]);

  useEffect(() => {
    if (declaredDirection === null) {
      try {
        localStorage.setItem(READING_DIRECTION_KEY, readingDirection);
      } catch {}
    }
    setShowRightHalf(readingDirection === "rtl");
  }, [readingDirection, declaredDirection]);

  const boxes = usePdfPageBoxes(pdf, index + 1);
  const orientationAt = useCallback(
    (i: number): Orientation => {
      const box = boxes.get(i + 1);
      if (!box) return "unknown";
      return box.width > box.height ? "landscape" : "portrait";
    },
    [boxes],
  );

  const canPair = useSpreadFits();
  const {
    face,
    nextFace,
    prevFace,
    subPageLabel,
    canGoPrev,
    canGoNext,
    navigatePrev: pagePrev,
    navigateNext: pageNext,
  } = useSpreadPaging({
    index,
    setIndex,
    count: numPages,
    spreadMode,
    readingDirection,
    showRightHalf,
    orientationAt,
    canPair,
    setShowRightHalf,
  });

  const store = useMemo(() => new DocumentCaptureStore(), []);
  const [selecting, setSelecting] = useState(false);
  const chrome = useAutoHidingChrome({ enabled: true, held: selecting });

  const close = useCallback(() => onClose(face.index + 1), [onClose, face.index]);

  // Counted rather than flagged: the face a turn lands on is known only
  // after the render it causes.
  const [turns, setTurns] = useState(0);
  const faceIndexRef = useRef(face.index);
  faceIndexRef.current = face.index;
  /** The face the first unreported turn started from. */
  const turnFromRef = useRef<number | null>(null);
  const countTurn = useCallback(() => {
    turnFromRef.current ??= faceIndexRef.current;
    setTurns((n) => n + 1);
  }, []);
  const navigatePrev = useCallback(() => {
    countTurn();
    pagePrev();
  }, [countTurn, pagePrev]);
  const navigateNext = useCallback(() => {
    countTurn();
    pageNext();
  }, [countTurn, pageNext]);
  const onPageTurnedRef = useRef(onPageTurned);
  onPageTurnedRef.current = onPageTurned;
  const reportedTurnsRef = useRef(0);
  useEffect(() => {
    if (reportedTurnsRef.current === turns) return;
    reportedTurnsRef.current = turns;
    const from = turnFromRef.current;
    turnFromRef.current = null;
    if (face.index !== from) onPageTurnedRef.current?.(face.index + 1);
  }, [turns, face.index]);

  const zoom = useViewerZoom({
    resetKey: `${face.kind}:${index}:${showRightHalf}`,
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: chrome.toggle,
    mouseSelectsText: true,
  });
  useViewerZoomShortcuts(zoom, true);

  const navigatePrevRef = useRef(navigatePrev);
  const navigateNextRef = useRef(navigateNext);
  navigatePrevRef.current = navigatePrev;
  navigateNextRef.current = navigateNext;
  const directionRef = useRef(readingDirection);
  directionRef.current = readingDirection;

  useShortcuts(
    "pdf-fullscreen",
    t("pdfFullscreenViewer"),
    [
      {
        key: "arrowleft",
        label: t("pdfPreviousPage"),
        handler: () =>
          directionRef.current === "ltr"
            ? navigatePrevRef.current()
            : navigateNextRef.current(),
      },
      {
        key: "arrowright",
        label: t("pdfNextPage"),
        handler: () =>
          directionRef.current === "ltr"
            ? navigateNextRef.current()
            : navigatePrevRef.current(),
      },
      {
        key: "pageup",
        label: t("pdfPreviousPage"),
        handler: () => navigatePrevRef.current(),
      },
      {
        key: "pagedown",
        label: t("pdfNextPage"),
        handler: () => navigateNextRef.current(),
      },
      { key: "f", label: tc("close"), handler: close },
      { key: "escape", label: tc("close"), handler: close },
    ],
    true,
    // A viewer covers the page: nothing under it may take a key — the file
    // arrows, which can register after this opens, included.
    OVERLAY_PRIORITY,
    true,
  );

  const enterPage = useCallback(
    (page: number) => {
      setIndex(Math.min(Math.max(0, page - 1), numPages - 1));
      setShowRightHalf(directionRef.current === "rtl");
    },
    [numPages],
  );

  useEffect(() => {
    if (!goToPageRef) return;
    goToPageRef.current = enterPage;
    return () => {
      goToPageRef.current = null;
    };
  }, [goToPageRef, enterPage]);

  // Per page: in a pair, the page that draws last must not clear the other
  // page's failure.
  const [failedPages, setFailedPages] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const markRender = useCallback((page: number, failed: boolean) => {
    setFailedPages((prev) => {
      if (prev.has(page) === failed) return prev;
      const next = new Set(prev);
      if (failed) next.add(page);
      else next.delete(page);
      return next;
    });
  }, []);

  const backdropRef = useInertBackdrop<HTMLDivElement>(true);

  // What is quoted is what is on screen: the page in view, or the text
  // selected in it. No anchor, so the quote button draws inside this viewer's
  // bar rather than floating over the page, below this layer.
  useEffect(() => {
    store.setCapture({ kind: "page", locator: { page: face.index + 1 } });
    window.getSelection()?.removeAllRanges();
    setSelecting(false);
  }, [face.index, showRightHalf, store]);

  useEffect(() => {
    const update = () => {
      const root = backdropRef.current;
      const selected = root
        ? readDocumentSelection(root, window.getSelection(), {
            includePdfPage: true,
          })
        : null;
      if (selected) {
        const { anchor: _anchor, ...rest } = selected;
        store.setCapture(rest);
        setSelecting(true);
      } else {
        store.setCapture({ kind: "page", locator: { page: face.index + 1 } });
        setSelecting(false);
      }
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [backdropRef, face.index, store]);

  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const { frameRef } = zoom;
  const attachFrame = useCallback(
    (el: HTMLDivElement | null) => {
      frameBoxRef.current = el;
      frameRef(el);
    },
    [frameRef],
  );
  useEffect(() => {
    const el = frameBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setFrame({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pages = face.indices.map((i) => i + 1);
  const deviceRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // Drawn at the settled zoom, so a zoomed page is sharp.
  const { widths, ratio } = faceRaster(
    face.kind,
    pages.map((n) => boxes.get(n)),
    frame,
    deviceRatio * zoom.settledScale,
  );

  // Neighbouring faces at the size a turn lands on: fit, zoom 1.
  const prefetch: RasterRequest[] = [];
  for (const next of [nextFace, prevFace]) {
    if (!next) continue;
    const nextPages = next.indices.map((i) => i + 1);
    const nextBoxes = nextPages.map((n) => boxes.get(n));
    const raster = faceRaster(next.kind, nextBoxes, frame, deviceRatio);
    nextPages.forEach((n, slot) => {
      const box = nextBoxes[slot];
      const width = raster.widths[slot];
      if (!box || width <= 0) return;
      prefetch.push({
        pageNumber: n,
        renderScale: (width / box.width) * raster.ratio,
      });
    });
  }

  // By content: the faces are new objects on every render, and the chrome
  // re-renders on every mouse move.
  const wantsKey = JSON.stringify({ visiblePages: pages, prefetch });
  useEffect(() => {
    rasterCacheFor(pdf).want(RASTER_OWNER, JSON.parse(wantsKey));
  }, [pdf, wantsKey]);
  useEffect(() => {
    const cache = rasterCacheFor(pdf);
    return () => cache.release(RASTER_OWNER);
  }, [pdf]);

  // A press on a link is the link's, not a page turn.
  const onFramePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest?.(".annotationLayer a")) return;
    zoom.frameHandlers.onPointerDown(e);
  };

  const activeSplit = face.kind === "half";

  return createPortal(
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal
      aria-label={`${t("pdfFullscreenViewer")}: ${title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300"
        {...chrome.chromeProps}
      >
        <span className="max-w-[30%] truncate text-sm text-white/80">{title}</span>

        <span className="flex items-center gap-1 font-mono text-sm text-white/60">
          <PdfPageInput
            page={face.index + 1}
            numPages={numPages}
            onCommit={(page) => {
              countTurn();
              enterPage(page);
            }}
            label={t("pdfPageNumber")}
            className="rounded-2xl bg-white/10 px-1 py-0.5 text-center text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          />
          {face.kind === "pair" && <span>–{face.indices[1] + 1}</span>}
          <span>/ {numPages}</span>
          {subPageLabel !== null && <span>{subPageLabel}</span>}
        </span>

        <div className="flex items-center gap-2">
          {slotProps && (
            <AddonSlot
              id="document-viewer-actions"
              layout="stack"
              props={{
                ...slotProps,
                documentCaptureController: store,
                tone: "on-dark",
              }}
            />
          )}
          {spreadMode && (
            <button
              onClick={() =>
                setReadingDirection((d) => (d === "ltr" ? "rtl" : "ltr"))
              }
              className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              aria-label={tg("readingDirection")}
            >
              {readingDirection === "ltr" ? tg("ltr") : tg("rtl")}
            </button>
          )}
          <button
            onClick={() => setSpreadMode((m) => !m)}
            className={`rounded-full p-1.5 transition-colors hover:bg-white/10 ${spreadMode ? "text-white" : "text-white/60 hover:text-white"}`}
            aria-label={tg("spreadModeToggle")}
          >
            <BookOpen size={18} />
          </button>
          <button
            onClick={close}
            className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        ref={attachFrame}
        className="flex flex-1 items-center overflow-hidden touch-none"
        {...zoom.frameHandlers}
        onPointerDown={onFramePointerDown}
      >
        <div
          ref={zoom.contentRef}
          className="flex h-full w-full items-center"
          style={zoom.contentStyle}
        >
          <div
            data-face={face.kind}
            className="flex h-full items-center justify-center"
            style={{
              width: activeSplit ? "200%" : "100%",
              flexShrink: activeSplit ? 0 : undefined,
              transform:
                activeSplit && showRightHalf ? "translateX(-50%)" : undefined,
              // The pages stay in reading order in the DOM for a screen
              // reader and for a selection that runs across both.
              flexDirection:
                face.kind === "pair" && readingDirection === "rtl"
                  ? "row-reverse"
                  : "row",
            }}
          >
            {pages.map((n, slot) =>
              widths[slot] > 0 ? (
                <section
                  key={n}
                  data-pdf-page={n}
                  aria-label={`${title}, ${n}`}
                  className="bg-white"
                >
                  <Page
                    pageNumber={n}
                    width={widths[slot]}
                    devicePixelRatio={ratio}
                    renderMode="custom"
                    customRenderer={PdfCanvas}
                    renderTextLayer
                    renderAnnotationLayer
                    loading={null}
                    onRenderError={() => markRender(n, true)}
                    onRenderSuccess={() => markRender(n, false)}
                  />
                </section>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {pages.some((n) => failedPages.has(n)) && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-8 text-center text-sm text-white/70"
        >
          {t("pdfRenderTooLarge")}
        </p>
      )}
      {chrome.visible &&
        (readingDirection === "ltr" ? canGoPrev : canGoNext) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              readingDirection === "ltr" ? navigatePrev() : navigateNext();
            }}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
            aria-label={
              readingDirection === "ltr" ? t("pdfPreviousPage") : t("pdfNextPage")
            }
          >
            <ChevronLeft size={32} />
          </button>
        )}
      {chrome.visible &&
        (readingDirection === "ltr" ? canGoNext : canGoPrev) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              readingDirection === "ltr" ? navigateNext() : navigatePrev();
            }}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
            aria-label={
              readingDirection === "ltr" ? t("pdfNextPage") : t("pdfPreviousPage")
            }
          >
            <ChevronRight size={32} />
          </button>
        )}
    </div>,
    document.body,
  );
}
