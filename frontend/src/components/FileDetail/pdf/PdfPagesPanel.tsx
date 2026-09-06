"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
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
  /** The first page in the window. Moves when the canvas leaves it. */
  const [first, setFirst] = useState(1);
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
  }, [state.numPages, paintedTo, window_, first]);

  // Following the canvas, not driving it: pressing a row moves the page, and
  // so does `PageDown`, and the rail has to keep up with both.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.page]);

  // A new document starts its rail over. Without this, a reader who grew
  // document A's rail to 40 opens document B with 40 thumbnails mounted at
  // once — the bounded-first-render property, lost on the second PDF of a
  // session.
  const [seenSrc, setSeenSrc] = useState(state.src);
  if (seenSrc !== state.src) {
    setSeenSrc(state.src);
    setWindow(INITIAL_THUMBNAIL_WINDOW);
    setPaintedTo(0);
    setFirst(1);
  }

  /**
   * The window moves to hold the page the canvas is on.
   *
   * The rail marks the current page and scrolls it into view, and neither is
   * possible while that page is outside the window: a jump to 180 left the
   * rail showing 1-8, marking nothing, with no way to reach 180 but scrolling
   * to the sentinel twenty-two times. *Extending* to 180 would answer that
   * and mount a hundred and eighty rasters at once, which is the freeze the
   * bound exists to prevent — so the window is re-seated instead. The
   * current page sits second in it, so the one before is still there.
   */
  const last = Math.min(first + window_ - 1, state.numPages);
  if (state.numPages > 0 && (state.page < first || state.page > last)) {
    setFirst(Math.max(1, state.page - 1));
    setPaintedTo(0);
  }
  const start = first;
  const shown = Math.min(first + window_ - 1, state.numPages);
  const outline = state.outline ?? [];

  /**
   * The entry the reader is inside, not the one that names this exact page.
   *
   * An outline gives a chapter's first page; the reader is on page 7 of a
   * chapter that starts at 3. Matching exactly leaves every page but the
   * chapter openings marked as belonging to nothing.
   */
  const activeOutlineIndex = outline.reduce(
    (best, item, i) =>
      item.page !== null && item.page <= state.page ? i : best,
    -1,
  );

  return (
    <div className={`flex min-h-0 flex-col gap-4 overflow-y-auto ${className}`}>
      {outline.length > 0 && (
        <nav aria-label={t("pdfOutline")}>
          <ul>
            {outline.map((item, i) => (
              <li key={`${i}-${item.title}`}>
                <button
                  type="button"
                  // `aria-disabled`, not `disabled`: a row with no reachable
                  // destination is still part of the table of contents its
                  // author wrote, and a `disabled` button leaves the tab
                  // order — a keyboard reader would find the list silently
                  // shorter than the one on screen.
                  aria-disabled={item.page === null || undefined}
                  aria-current={i === activeOutlineIndex ? "true" : undefined}
                  onClick={() => item.page !== null && controller.goToPage(item.page)}
                  style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
                  className={`flex w-full items-baseline gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors pointer-coarse:min-h-11 ${
                    i === activeOutlineIndex
                      ? "bg-bg-elevated font-medium text-text-primary"
                      : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                  } ${item.page === null ? "cursor-default opacity-100" : ""}`}
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

      <ol
        aria-label={t("pdfThumbnails")}
        className="flex flex-col items-center gap-2"
        data-testid="pdf-thumbnails"
      >
        {Array.from({ length: Math.max(0, shown - start + 1) }, (_, i) => start + i).map((n) => (
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
 * on pdf.js in a tree the server renders. (`lib/pdfDependencies.test.ts`
 * asserts the pdfjs and react-pdf versions agree; keeping the worker out of
 * the server bundle is what `next/dynamic` with `ssr: false` does, and
 * `FilePreview` loads the viewer the same way.)
 */
/**
 * Whether this subtree has ever been on screen.
 *
 * `InspectorShell` mounts every panel and hides the ones that are not
 * selected — the invariant is written into that file, and it is there so a
 * panel does not lose a fetch or a scroll position when the reader tabs away.
 * A thumbnail rail has neither, and mounting it eagerly is not free: pdf.js
 * opens the document a second time and rasterises eight pages behind a
 * `display: none`, for every multi-page PDF, whether or not anyone opens the
 * tab. A hidden element has no layout, so this is exactly what
 * `IntersectionObserver` answers.
 *
 * Once true it stays true: coming back to the tab must not re-parse.
 */
function useHasBeenVisible(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer to ask — jsdom, and any browser old enough not to have
      // one. Draw it rather than leave the tab permanently empty.
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

export function PdfPagesTab({ controller }: { controller: PdfController }) {
  const t = useTranslations("file");
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = useHasBeenVisible(hostRef);

  if (!visible) {
    return <div ref={hostRef} className="h-full w-full" />;
  }

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
