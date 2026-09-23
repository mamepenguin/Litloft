"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Page } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { AddonSlot } from "@/components/AddonSlot";
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
import { faceWidths } from "@/lib/pdfFace";
import { rasterPixelRatio } from "@/lib/pdfZoomMode";
import { readSpreadMode, writeSpreadMode } from "@/lib/spreadPreference";
import type { Orientation } from "@/lib/spreadPaging";

const READING_DIRECTION_KEY = "image-viewer:reading-direction";

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
  onClose,
}: {
  pdf: PDFDocumentProxy;
  title: string;
  initialPage: number;
  slotProps?: DocumentSlotProps;
  /** Called with the page the reader was on, 1-based. */
  onClose: (page: number) => void;
}) {
  const t = useTranslations("file");
  const tg = useTranslations("gallery");
  const tc = useTranslations("common");
  const numPages = pdf.numPages;

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialPage - 1), numPages - 1),
  );
  const [spreadMode, setSpreadMode] = useState(() => readSpreadMode());
  const [readingDirection, setReadingDirection] = useState(readReadingDirection);
  const [showRightHalf, setShowRightHalf] = useState(
    () => readReadingDirection() === "rtl",
  );

  // A face is entered from its first half in reading order, whichever of
  // the two switches changed.
  useEffect(() => {
    writeSpreadMode(spreadMode);
    setShowRightHalf(readingDirection === "rtl");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadMode]);

  useEffect(() => {
    try {
      localStorage.setItem(READING_DIRECTION_KEY, readingDirection);
    } catch {}
    setShowRightHalf(readingDirection === "rtl");
  }, [readingDirection]);

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
    subPageLabel,
    canGoPrev,
    canGoNext,
    navigatePrev,
    navigateNext,
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

  const zoom = useViewerZoom({
    resetKey: `${face.kind}:${index}:${showRightHalf}`,
    readingDirection,
    navigatePrev,
    navigateNext,
    toggleControls: chrome.toggle,
    mouseDragPans: false,
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
  );

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
  const widths = faceWidths(
    face.kind,
    pages.map((n) => boxes.get(n)),
    frame,
  );
  const faceWidth = widths.reduce((a, b) => a + b, 0);
  const faceHeight = Math.max(
    ...pages.map((n, slot) => {
      const box = boxes.get(n);
      return box ? widths[slot] * (box.height / box.width) : widths[slot];
    }),
    0,
  );
  // Sized for the whole face, so a pair shares one budget rather than taking
  // two, and for the settled zoom, so a zoomed page is drawn sharp.
  const ratio = rasterPixelRatio({
    cssWidth: faceWidth,
    cssHeight: faceHeight,
    devicePixelRatio:
      (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) *
      zoom.settledScale,
  });

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
            onCommit={(n) => {
              setIndex(n - 1);
              setShowRightHalf(readingDirection === "rtl");
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
              props={{ ...slotProps, documentCaptureController: store }}
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
                    renderTextLayer
                    renderAnnotationLayer
                    loading={null}
                  />
                </section>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {chrome.visible &&
        (readingDirection === "ltr" ? canGoPrev : canGoNext) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              readingDirection === "ltr" ? navigatePrev() : navigateNext();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
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
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-opacity hover:text-white"
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
