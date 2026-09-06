"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Document, Page } from "react-pdf";

import type { PdfController } from "@/lib/pdfController";

/**
 * How many thumbnails are mounted before anything has scrolled.
 *
 * A 225-page PDF drawn all at once locks pdf.js for tens of seconds, so the
 * rail mounts a window and grows it as the reader scrolls. The number is a
 * page and a bit of an inspector column at 72px plus the row's label, chosen
 * so the first screenful is already there and nothing below it is paid for.
 */
export const INITIAL_THUMBNAIL_WINDOW = 8;

/** How many more arrive each time the sentinel comes into view. */
const THUMBNAIL_PAGE_SIZE = 8;

const THUMBNAIL_WIDTH = 72;

/**
 * The reader's place in a document, and the two ways of moving it.
 *
 * Both halves are optional and neither creates the tab on its own — the shell
 * drops a tab whose content is null, so a one-page PDF with no outline never
 * grows a tab strip.
 */
export function PdfPagesPanel({
  controller,
  className = "",
}: {
  controller: PdfController;
  className?: string;
}) {
  const t = useTranslations("file");
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  );
  const [window_, setWindow] = useState(INITIAL_THUMBNAIL_WINDOW);
  /**
   * The last page pdf.js has finished drawing.
   *
   * The sentinel is only mounted once the window it follows has painted.
   * Without that gate the rail grows a second time before the first eight
   * thumbnails have any height: an unpainted `<Page>` is a zero-height box,
   * so eight of them do not fill the column, the sentinel is in view at t=0,
   * and a 225-page document opens having mounted sixteen. Measured in
   * Chromium — 16 in the rail before this, 8 after.
   */
  const [paintedTo, setPaintedTo] = useState(0);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Re-observed whenever the sentinel is remounted, which is what the
    // `paintedTo` gate does after each window.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setWindow((n) => Math.min(n + THUMBNAIL_PAGE_SIZE, state.numPages));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.numPages, paintedTo, window_]);

  // Following the canvas, not driving it: pressing a row moves the page, and
  // so does `PageDown`, and the rail has to keep up with both.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.page]);

  const shown = Math.min(window_, state.numPages);
  const outline = state.outline ?? [];

  return (
    <div className={`flex min-h-0 flex-col gap-4 overflow-y-auto ${className}`}>
      {outline.length > 0 && (
        <nav aria-label={t("pdfOutline")}>
          <ul>
            {outline.map((item, i) => (
              <li key={`${i}-${item.title}`}>
                <button
                  type="button"
                  disabled={item.page === null}
                  onClick={() => item.page !== null && controller.goToPage(item.page)}
                  style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
                  className={`flex w-full items-baseline gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors pointer-coarse:min-h-11 ${
                    item.page === state.page
                      ? "bg-bg-elevated font-medium text-text-primary"
                      : "text-text-muted enabled:hover:bg-bg-elevated enabled:hover:text-text-primary"
                  }`}
                >
                  <span className="min-w-0 flex-1">{item.title}</span>
                  {item.page !== null && (
                    <span className="shrink-0 font-mono text-xs">{item.page}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <ol className="flex flex-col items-center gap-2" data-testid="pdf-thumbnails">
        {Array.from({ length: shown }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <button
              type="button"
              ref={n === state.page ? currentRef : undefined}
              onClick={() => controller.goToPage(n)}
              aria-current={n === state.page ? "true" : undefined}
              aria-label={t("pdfGoToPage", { page: n })}
              className={`flex flex-col items-center gap-1 rounded-lg border p-1 transition-colors ${
                n === state.page
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-muted hover:bg-bg-elevated"
              }`}
            >
              <Page
                pageNumber={n}
                width={THUMBNAIL_WIDTH}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={() => setPaintedTo((done) => Math.max(done, n))}
              />
              <span className="font-mono text-xs">{n}</span>
            </button>
          </li>
        ))}
        {shown < state.numPages && paintedTo >= shown && (
          <li ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />
        )}
      </ol>
    </div>
  );
}

/**
 * The panel plus the second `<Document>` it needs.
 *
 * The canvas's `PDFDocumentProxy` is not reachable from here — react-pdf's
 * `<Page>` reads it from a `<Document>` context — so the rail opens the same
 * URL again, taken from the controller. The bytes come from the browser's
 * cache; what is paid twice is pdf.js's parse, and the alternative is
 * threading a proxy through the shell as a prop, which makes the shell depend
 * on pdf.js in a tree the server renders (`lib/pdfDependencies.test.ts`
 * exists to prevent exactly that).
 */
export function PdfPagesTab({ controller }: { controller: PdfController }) {
  const t = useTranslations("file");
  return (
    <Document
      file={controller.getState().src}
      loading={<p className="p-4 text-sm text-text-muted">{t("pdfLoading")}</p>}
      error={<p className="p-4 text-sm text-danger">{t("pdfLoadFailed")}</p>}
      className="flex h-full min-h-0 flex-col"
    >
      <PdfPagesPanel controller={controller} className="h-full p-2" />
    </Document>
  );
}
