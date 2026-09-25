"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { getStreamUrl } from "@/lib/api";
import { rasterCacheFor, type RasterRequest } from "@/lib/pdfRasterCache";
import { declaredReadingDirection } from "@/lib/pdfReadingDirection";
import { usePdfPageProgress } from "@/lib/pdfPageProgress";
import { readStored, writeStored } from "@/lib/safeStorage";
import {
  DEFAULT_PDF_ZOOM_MODE,
  PDF_ZOOM_MODES,
  PDF_ZOOM_MODE_KEY,
  parsePdfZoomMode,
  pdfPageWidth,
  type PageBox,
  pageRasterRatio,
  type PdfZoomMode,
} from "@/lib/pdfZoomMode";
import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { PdfCanvas } from "@/components/pdf/PdfCanvas";
import { PdfPageInput } from "@/components/pdf/PdfPageInput";
import { usePdfPageBoxes } from "@/components/pdf/usePdfPageBoxes";
import {
  PdfFullscreenViewer,
  type DocumentSlotProps,
} from "@/components/pdf/PdfFullscreenViewer";
import { useShortcuts } from "@/hooks/useShortcuts";
import {
  flattenOutline,
  PdfDocumentStore,
  type PdfController,
} from "@/lib/pdfController";
import {
  DocumentCaptureStore,
  readDocumentSelection,
  type DocumentCaptureController,
} from "@/lib/documentCapture";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * `satisfies Record<PdfZoomMode, string>` makes adding or renaming a mode a
 * type error here. It does not catch a typo in the key itself: this
 * frontend augments no next-intl `Messages`, so `t` accepts any string.
 */
const MODE_LABEL_KEY = {
  "fit-width": "pdfZoomMode_fit-width",
  "fit-page": "pdfZoomMode_fit-page",
  actual: "pdfZoomMode_actual",
} as const satisfies Record<PdfZoomMode, string>;

/**
 * The fallback only, for environments that compute no styles. Everywhere
 * else the padding is read off the element, because `p-4` is `1rem` and a
 * reader whose browser default is 20px has 40px of it, not 32.
 */
const PAGE_BOX_PADDING_Y = 32;

function pageBoxPaddingY(box: Element): number {
  const style = getComputedStyle(box);
  const top = parseFloat(style.paddingTop);
  const bottom = parseFloat(style.paddingBottom);
  return Number.isFinite(top) && Number.isFinite(bottom)
    ? top + bottom
    : PAGE_BOX_PADDING_Y;
}

const RASTER_OWNER = "inline";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

export function PdfPreview({
  fileId,
  title,
  initialPage,
  onDocumentCaptureController,
  onPdfController,
  documentSlotProps,
}: {
  fileId: string;
  title: string;
  initialPage?: number;
  /** What a full-screen viewer hands to addons that act on the document. */
  documentSlotProps?: DocumentSlotProps;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
  onPdfController?: (controller: PdfController | null) => void;
}) {
  const t = useTranslations("file");
  const rootRef = useRef<HTMLDivElement>(null);
  const store = useMemo(() => new DocumentCaptureStore(), []);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(() =>
    Number.isInteger(initialPage) && (initialPage ?? 0) > 0 ? initialPage! : 1,
  );
  const [zoom, setZoom] = useState(1);
  const [availableWidth, setAvailableWidth] = useState(800);
  // Its own measurement rather than a share of the viewport: the box is a
  // fraction of the canvas, which is not the window.
  const [availableHeight, setAvailableHeight] = useState(600);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const [pageBox, setPageBox] = useState<PageBox | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>(DEFAULT_PDF_ZOOM_MODE);
  const [renderFailed, setRenderFailed] = useState(false);
  /**
   * Set only once the document's own viewing preferences have been read, so
   * a full-screen viewer never opens in one reading direction and turns to
   * the other.
   */
  const [loaded, setLoaded] = useState<{
    pdf: PDFDocumentProxy;
    declaredDirection: "ltr" | "rtl" | null;
  } | null>(null);
  const latestPdfRef = useRef<PDFDocumentProxy | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { documentLoaded } = usePdfPageProgress({
    fileId,
    page,
    requestedPage: initialPage,
    goTo: setPage,
  });
  const fullscreenGoToRef = useRef<((page: number) => void) | null>(null);

  // Read after mount, not in the initialiser: the server render has no
  // storage, and a value read during it would be hydrated over.
  useEffect(() => {
    setZoomMode(parsePdfZoomMode(readStored(PDF_ZOOM_MODE_KEY)));
  }, []);

  const chooseZoomMode = useCallback((next: PdfZoomMode) => {
    setZoomMode(next);
    writeStored(PDF_ZOOM_MODE_KEY, next);
    // A mode is a statement about the whole page; carrying a 150% into
    // "whole page" would mean the page does not fit, which is the one
    // thing that mode promises. Zoom afterwards still works, and leaves
    // the mode where it is.
    setZoom(1);
  }, []);
  const src = getStreamUrl(fileId);
  const pdfStore = useMemo(() => new PdfDocumentStore(), []);

  /**
   * The reset below must not run on the first pass: `<Document>` reports
   * `onLoadSuccess` from a child effect, which React runs *before* this one,
   * so an unguarded reset would clear the count the document had just given.
   */
  const loadedFileRef = useRef(fileId);

  useEffect(() => {
    if (loadedFileRef.current === fileId) return;
    loadedFileRef.current = fileId;
    setZoom(1);
    setNumPages(0);
    setPageBox(null);
    setLoaded(null);
    latestPdfRef.current = null;
    setFullscreen(false);
    // The store describes a document, and the document is changing. Left
    // alone, the page list would draw the previous file's table of contents
    // over this one, and `goToPage` would validate a jump against the
    // previous file's length — setting page 121 on a three-page PDF.
    pdfStore.set({ numPages: 0, outline: null });
  }, [fileId, pdfStore]);

  useEffect(() => {
    const requested =
      Number.isInteger(initialPage) && (initialPage ?? 0) > 0
        ? initialPage!
        : 1;
    setPage(requested);
  }, [fileId, initialPage]);

  useEffect(() => {
    onDocumentCaptureController?.(store);
    return () => onDocumentCaptureController?.(null);
  }, [onDocumentCaptureController, store]);

  useEffect(() => {
    store.setCapture({ kind: "page", locator: { page } });
    window.getSelection()?.removeAllRanges();
  }, [page, store]);

  useEffect(() => {
    const update = () => {
      const root = rootRef.current;
      const selected = root
        ? readDocumentSelection(root, window.getSelection(), {
            includePdfPage: true,
          })
        : null;
      store.setCapture(selected ?? { kind: "page", locator: { page } });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [page, store]);

  useEffect(() => {
    const box = pageBoxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    // Width comes from the content box, which excludes `p-4` and the
    // vertical scrollbar's gutter — reserved unconditionally below, so
    // the number does not move when the scrollbar comes and goes.
    //
    // Height comes from the *border* box, minus that same padding. A
    // horizontal scrollbar takes its thickness out of the content box, and
    // `fit-page` turns height into width: a shorter box makes a narrower
    // page, a narrower page retires the scrollbar, the height grows back.
    //
    // `borderBoxSize` postdates `ResizeObserver` itself, so the guard at
    // the top of this effect does not cover it.
    const observer = new ResizeObserver(([entry]) => {
      const borderHeight = entry.borderBoxSize?.[0]?.blockSize;
      setAvailableWidth(entry.contentRect.width);
      setAvailableHeight(
        borderHeight === undefined
          ? entry.contentRect.height
          : borderHeight - pageBoxPaddingY(box),
      );
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    pdfStore.onGoToPage = (next) => setPage(next);
    onPdfController?.(pdfStore);
    return () => {
      pdfStore.onGoToPage = null;
      onPdfController?.(null);
    };
  }, [onPdfController, pdfStore]);

  useEffect(() => {
    pdfStore.set({ page, numPages, src });
  }, [page, numPages, src, pdfStore]);


  /**
   * `getOutline()` answers `null` for a PDF that has none, which is a
   * different fact from "not asked yet" — `flattenOutline` turns it into `[]`
   * and the store's `null` keeps the distinction.
   */
  const loadOutline = useCallback(
    async (pdf: PDFDocumentProxy) => {
      try {
        const raw = await pdf.getOutline();
        const outline = await flattenOutline(raw, async (dest) => {
          try {
            const resolved =
              typeof dest === "string" ? await pdf.getDestination(dest) : dest;
            if (!Array.isArray(resolved)) return null;
            const target = resolved[0];
            // Most destinations name a page by reference, which only the
            // document can resolve. Some name it by 0-based index outright,
            // and `getPageIndex` throws on those.
            if (typeof target === "number") return target + 1;
            const index = await pdf.getPageIndex(target);
            return index + 1;
          } catch {
            // A destination naming a page the document does not have. The
            // row stays, without a jump: dropping it would silently shorten
            // a table of contents the author wrote.
            return null;
          }
        });
        pdfStore.set({ outline });
      } catch {
        // The viewer answers either way. A consumer that saw `null` forever
        // would be waiting on a document that has already failed to say.
        pdfStore.set({ outline: [] });
      }
    },
    [pdfStore],
  );

  /**
   * Deliberately not `async`: react-pdf calls this from an effect in some
   * versions and in the tests, and a returned promise is read there as a
   * cleanup function.
   */
  const handleLoad = useCallback(
    (pdf: PDFDocumentProxy) => {
      const count = pdf.numPages;
      setNumPages(count);
      latestPdfRef.current = pdf;
      void Promise.resolve()
        .then(() => pdf.getViewerPreferences())
        .catch(() => null)
        .then((preferences) => {
          // A document replaced while this was being read is not the one
          // on screen.
          if (latestPdfRef.current !== pdf) return;
          setLoaded({
            pdf,
            declaredDirection: declaredReadingDirection(preferences),
          });
        });
      setPage((current) => Math.min(Math.max(1, current), count));
      documentLoaded(count);
      void loadOutline(pdf);
    },
    [loadOutline, documentLoaded],
  );

  const movePage = useCallback(
    (delta: number) => {
      setPage((current) =>
        Math.min(numPages || 1, Math.max(1, current + delta)),
      );
    },
    [numPages],
  );

  /**
   * `ShortcutsProvider` calls `preventDefault` on every match, so an
   * unscoped page-key binding stops `PageDown` scrolling the inspector and
   * a page zoomed past the canvas box.
   *
   * Body counts as inside: a reader who has clicked nothing has focused
   * nothing, and the viewer is what the page is for.
   */
  const [inScope, setInScope] = useState(true);
  useEffect(() => {
    const update = () => {
      const active = document.activeElement;
      setInScope(
        !active ||
          active === document.body ||
          rootRef.current?.contains(active) === true,
      );
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  /**
   * Deliberately not `←` / `→`: `useFileNav` binds the arrows to the
   * previous and next file in the folder whenever `playerKind` is null,
   * which a PDF is.
   */
  useShortcuts(
    "pdf-viewer",
    t("pdfShortcuts"),
    [
      {
        key: "pagedown",
        label: t("pdfNextPage"),
        handler: () => movePage(1),
      },
      {
        key: "pageup",
        label: t("pdfPreviousPage"),
        handler: () => movePage(-1),
      },
    ],
    numPages > 1 && inScope,
  );

  useShortcuts(
    "pdf-viewer-open",
    t("pdfShortcuts"),
    [
      {
        key: "f",
        label: t("pdfFullscreen"),
        handler: () => setFullscreen(true),
      },
    ],
    loaded !== null && inScope && !fullscreen,
  );

  /**
   * Every keystroke in the page box is a state change, and a large PDF
   * cannot afford to re-render the canvas on each of them.
   */
  const boxes = usePdfPageBoxes(loaded?.pdf ?? null, page);
  // The fetched box of the page being turned to is known before react-pdf
  // reports it, so the first draw is already at the size a prefetch used.
  const currentBox = boxes.get(page) ?? pageBox;
  const deviceRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const baseWidth = pdfPageWidth({
    mode: zoomMode,
    available: availableWidth,
    availableHeight,
    pageBox: currentBox,
  });

  const drawWidth = baseWidth * zoom;

  useEffect(() => {
    const pdf = loaded?.pdf;
    if (!pdf) return;
    const prefetch: RasterRequest[] = [];
    // The full-screen viewer does its own; the inline page underneath it
    // keeps only what it shows.
    if (!fullscreen) {
      for (const n of [page + 1, page - 1]) {
        const box = boxes.get(n);
        if (n < 1 || n > numPages || !box) continue;
        const width =
          pdfPageWidth({
            mode: zoomMode,
            available: availableWidth,
            availableHeight,
            pageBox: box,
          }) * zoom;
        if (width <= 0) continue;
        prefetch.push({
          pageNumber: n,
          renderScale:
            (width / box.width) * pageRasterRatio(box, width, deviceRatio),
        });
      }
    }
    rasterCacheFor(pdf).want(RASTER_OWNER, { visiblePages: [page], prefetch });
  }, [
    loaded?.pdf,
    fullscreen,
    page,
    numPages,
    boxes,
    zoomMode,
    availableWidth,
    availableHeight,
    zoom,
    deviceRatio,
  ]);

  useEffect(() => {
    const pdf = loaded?.pdf;
    if (!pdf) return;
    const cache = rasterCacheFor(pdf);
    return () => cache.clear();
  }, [loaded?.pdf]);

  const pageElement = useMemo(
    () => (
      <Page
        pageNumber={page}
        width={drawWidth}
        // A budget for pixels, not for layout. The page keeps the size
        // the mode promises; only the raster behind it gets coarser, and
        // only where the browser would otherwise refuse the allocation
        // and paint nothing.
        devicePixelRatio={pageRasterRatio(currentBox, drawWidth, deviceRatio)}
        onLoadSuccess={(loaded) => {
          // The page's own size, in points. Read from the viewport at
          // scale 1 rather than from react-pdf's derived `width`, which
          // is already the number we handed it.
          const view = loaded.getViewport({ scale: 1 });
          setPageBox((current) =>
            current &&
            current.width === view.width &&
            current.height === view.height
              ? current
              : { width: view.width, height: view.height },
          );
        }}
        // A page can fail to raster with nothing thrown: the canvas is
        // sized `width * zoom * devicePixelRatio` on each axis, and a
        // very large page at 200% asks for an allocation the browser
        // may simply refuse. Without this the page goes blank and the
        // reader has no way to know that zooming out is the way back.
        onRenderError={() => setRenderFailed(true)}
        onRenderSuccess={() => setRenderFailed(false)}
        renderMode="custom"
        customRenderer={PdfCanvas}
        renderTextLayer
        renderAnnotationLayer
      />
    ),
    [page, drawWidth, currentBox, deviceRatio],
  );

  return (
    <div ref={rootRef} className="w-full overflow-hidden rounded-xl bg-bg-card">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-2 border-b border-bg-border bg-bg-card px-3 py-2">
        <button
          type="button"
          onClick={() => movePage(-1)}
          disabled={page <= 1}
          aria-label={t("pdfPreviousPage")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="flex items-center gap-1 text-xs font-mono text-text-muted">
          <PdfPageInput
            page={page}
            numPages={numPages}
            onCommit={setPage}
            label={t("pdfPageNumber")}
            className="rounded-2xl border border-bg-border bg-bg-primary px-1 py-0.5 text-center text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          />
          <span>/ {numPages || "–"}</span>
        </span>
        <button
          type="button"
          onClick={() => movePage(1)}
          disabled={numPages === 0 || page >= numPages}
          aria-label={t("pdfNextPage")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
        <span className="mx-1 h-5 w-px bg-bg-border" />
        <ToolbarMenu
          label={t("pdfZoomMode")}
          value={t(MODE_LABEL_KEY[zoomMode])}
          icon={Maximize2}
          align="start"
          portalOnPhone
        >
          {(close) => (
            <MenuRadioGroup
              heading={t("pdfZoomMode")}
              options={PDF_ZOOM_MODES.map((mode) => ({
                value: mode,
                label: t(MODE_LABEL_KEY[mode]),
              }))}
              isSelected={(mode) => mode === zoomMode}
              onSelect={(mode) => {
                chooseZoomMode(mode);
                close();
              }}
            />
          )}
        </ToolbarMenu>
        <button
          type="button"
          onClick={() =>
            setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
          }
          disabled={zoom <= MIN_ZOOM}
          aria-label={t("pdfZoomOut")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
        <span className="min-w-10 text-center text-xs font-mono text-text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
          }
          disabled={zoom >= MAX_ZOOM}
          aria-label={t("pdfZoomIn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          disabled={loaded === null}
          aria-label={t("pdfFullscreen")}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <Maximize size={15} />
        </button>
        <a
          href={`${src}#page=${page}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("openInNewTab")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated"
        >
          <ExternalLink size={15} />
        </a>
      </div>

      <div
        ref={pageBoxRef}
        // `safe center`, not `center`. A flex container centres an
        // overflowing child by pushing half the overflow past its *start*
        // edge, and there is nothing to scroll to there.
        //
        // The gutter reservation is load-bearing: without it a classic
        // vertical scrollbar takes its width out of `contentRect.width`
        // when it appears, and `fit-width` oscillates.
        //
        // `both-edges`, not plain `stable`: in "whole page" no vertical
        // scrollbar is ever drawn, so a one-sided reservation stays empty
        // and the page sits off true centre.
        className="flex h-[80vh] [justify-content:safe_center] overflow-auto [scrollbar-gutter:stable_both-edges] bg-bg-elevated p-4"
      >
        <Document
          file={src}
          onLoadSuccess={handleLoad}
          // Without this react-pdf scrolls to the target page, which is not
          // mounted: only the page in view is drawn.
          onItemClick={({ pageNumber }) => {
            if (fullscreenGoToRef.current) fullscreenGoToRef.current(pageNumber);
            else setPage(pageNumber);
          }}
          loading={
            <p className="py-16 text-sm text-text-muted">{t("pdfLoading")}</p>
          }
          error={
            <p className="py-16 text-sm text-danger">{t("pdfLoadFailed")}</p>
          }
        >
          <section data-pdf-page={page} aria-label={`${title}, ${page}`}>
            {renderFailed && (
              <p
                data-testid="pdf-render-failed"
                className="py-16 text-sm text-danger"
              >
                {t("pdfRenderTooLarge")}
              </p>
            )}
            {pageElement}
          </section>
          {fullscreen && loaded && (
            <PdfFullscreenViewer
              pdf={loaded.pdf}
              declaredDirection={loaded.declaredDirection}
              title={title}
              initialPage={page}
              slotProps={documentSlotProps}
              goToPageRef={fullscreenGoToRef}
              onPageChange={setPage}
              onClose={(last) => {
                setFullscreen(false);
                setPage(last);
              }}
            />
          )}
        </Document>
      </div>
    </div>
  );
}
