"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { getStreamUrl } from "@/lib/api";
import { useShortcuts } from "@/hooks/useShortcuts";
import {
  flattenOutline,
  parsePageInput,
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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

export function PdfPreview({
  fileId,
  title,
  initialPage,
  onDocumentCaptureController,
  onPdfController,
}: {
  fileId: string;
  title: string;
  initialPage?: number;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
  /** Published upward so the inspector's page list can read and move it. */
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
  const src = getStreamUrl(fileId);

  useEffect(() => {
    setZoom(1);
  }, [fileId]);

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
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(Math.max(280, entry.contentRect.width - 32));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const pdfStore = useMemo(() => new PdfDocumentStore(), []);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

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
   * The outline is a property of the loaded document, so it costs no request.
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
            const index = await pdf.getPageIndex(resolved[0]);
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
      setPage((current) => Math.min(Math.max(1, current), count));
      void loadOutline(pdf);
    },
    [loadOutline],
  );

  const movePage = useCallback((delta: number) => {
    setPage((current) => Math.min(numPages || 1, Math.max(1, current + delta)));
  }, [numPages]);

  /**
   * `PageUp` / `PageDown`, and deliberately not `←` / `→`.
   *
   * `useFileNav` binds the arrows to the previous and next file in the folder
   * whenever `playerKind` is null, which a PDF is, and
   * `docs/user-guide/keyboard-shortcuts.md` has published that meaning. One
   * kind of file where the arrows mean something else is a thing the reader
   * has to remember.
   *
   * Typing a number is not also a page turn, and that is the registry's own
   * default rather than a gate here: a `ShortcutDef` with no `editingOnly`
   * fires only when nothing editable has focus.
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
    numPages > 1,
  );

  /**
   * Held apart from the rest of the toolbar's render.
   *
   * Every keystroke in the page box is a state change, and a 225-page PDF
   * cannot afford to re-render the canvas on each of them. The element
   * depends on the page and the width and on nothing else, so a draft the
   * reader has not confirmed yet costs a toolbar render and no more.
   */
  const pageElement = useMemo(
    () => (
      <Page
        pageNumber={page}
        width={Math.min(900, availableWidth) * zoom}
        renderTextLayer
        renderAnnotationLayer
      />
    ),
    [page, availableWidth, zoom],
  );

  const commitPageInput = () => {
    if (pageDraft === null) return;
    const parsed = parsePageInput(pageDraft, numPages);
    // Out of range puts the box back rather than moving the page. A reader
    // who typed `999` into a 225-page document and landed on 225 cannot tell
    // that from the number having been accepted.
    if (parsed !== null) setPage(parsed);
    setPageDraft(null);
  };

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
          {/* `text`, not `number`: the spinner a browser draws does not fit a
              box sized to the page count, and it is chrome the OS owns —
              the same reason the viewers' `<select>`s went. `inputMode`
              still brings up the numeric keypad. */}
          <input
            ref={pageInputRef}
            type="text"
            inputMode="numeric"
            value={pageDraft ?? String(page)}
            aria-label={t("pdfPageNumber")}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={commitPageInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPageInput();
                pageInputRef.current?.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setPageDraft(null);
                pageInputRef.current?.blur();
              }
            }}
            // Sized by the page count's digits, so a 9-page document does not
            // carry a box built for 2000.
            style={{ width: `${String(numPages || 1).length + 2}ch` }}
            className="rounded border border-bg-border bg-bg-primary px-1 py-0.5 text-center text-text-primary"
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
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
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
          onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          aria-label={t("pdfZoomIn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
        >
          <Plus size={16} />
        </button>
        <a
          href={`${src}#page=${page}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("openInNewTab")}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated"
        >
          <ExternalLink size={15} />
        </a>
      </div>

      <div className="flex h-[80vh] justify-center overflow-auto bg-bg-elevated p-4">
        <Document
          file={src}
          onLoadSuccess={handleLoad}
          loading={<p className="py-16 text-sm text-text-muted">{t("pdfLoading")}</p>}
          error={<p className="py-16 text-sm text-danger">{t("pdfLoadFailed")}</p>}
        >
          <section data-pdf-page={page} aria-label={`${title}, ${page}`}>
            {pageElement}
          </section>
        </Document>
      </div>
    </div>
  );
}
