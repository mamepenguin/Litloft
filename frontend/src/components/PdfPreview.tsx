"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { getStreamUrl } from "@/lib/api";
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
}: {
  fileId: string;
  title: string;
  initialPage?: number;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
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

  const handleLoad = useCallback(
    ({ numPages: count }: { numPages: number }) => {
      setNumPages(count);
      setPage((current) => Math.min(Math.max(1, current), count));
    },
    [],
  );

  const movePage = (delta: number) => {
    setPage((current) => Math.min(numPages || 1, Math.max(1, current + delta)));
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
        <span className="min-w-20 text-center text-xs font-mono text-text-muted">
          {page} / {numPages || "–"}
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
            <Page
              pageNumber={page}
              width={Math.min(900, availableWidth) * zoom}
              renderTextLayer
              renderAnnotationLayer
            />
          </section>
        </Document>
      </div>
    </div>
  );
}
