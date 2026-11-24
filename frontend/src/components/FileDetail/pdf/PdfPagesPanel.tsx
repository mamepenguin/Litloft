"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import { Document, Page } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { InspectorActiveTabContext } from "@/components/FileDetail/inspector/activeTab";
import type { PdfController, PdfDocumentState } from "@/lib/pdfController";

/** Every page is rasterised at this width and scaled down by CSS. */
const RASTER_WIDTH = 128;

const MAX_DRAWN_PAGES = 120;

const A4_RATIO = 1.414;

const RATIO_TOLERANCE = 0.02;

const PAGES_AROUND_WITHOUT_OBSERVER = 3;

const STICKY_TOP_VAR = "--inspector-sticky-top";

type CellState = "placeholder" | "drawing" | "drawn" | "failed";

/**
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
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  );
  const t = useTranslations("file");
  const [loaded, setLoaded] = useState<{
    src: string;
    pdf: PDFDocumentProxy;
  } | null>(null);
  const pdf = loaded?.src === state.src ? loaded.pdf : null;
  const onLoadSuccess = useCallback(
    (next: PDFDocumentProxy) => setLoaded({ src: state.src, pdf: next }),
    [state.src],
  );

  // The canvas's `PDFDocumentProxy` is not reachable from here — react-pdf's
  // `<Page>` reads it from a `<Document>` context — so the rail opens the same
  // URL again, taken from the controller. The bytes come from the browser's
  // cache; what is paid twice is pdf.js's parse, and the alternative is
  // threading a proxy through the shell as a prop, which makes the shell depend
  // on pdf.js in a tree the server renders.
  return (
    <Document
      file={state.src}
      onLoadSuccess={onLoadSuccess}
      loading={<p className="p-4 text-sm text-text-muted">{t("pdfLoading")}</p>}
      error={<p className="p-4 text-sm text-danger">{t("pdfLoadFailed")}</p>}
      className="flex h-full min-h-0 flex-col"
    >
      {/* The key is the reset: an effect cannot clear the state of the child it renders. */}
      <PdfPagesContent
        key={state.src}
        pdf={pdf}
        controller={controller}
        state={state}
        className={className}
      />
    </Document>
  );
}

function PdfPagesContent({
  pdf,
  controller,
  state,
  className,
}: {
  pdf: PDFDocumentProxy | null;
  controller: PdfController;
  state: PdfDocumentState;
  className: string;
}) {
  const t = useTranslations("file");
  const activeTab = useContext(InspectorActiveTabContext);
  const shown = activeTab === null || activeTab === "pages";

  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const lastFollowed = useRef<number | null>(null);

  const [firstRatio, setFirstRatio] = useState<number | null>(null);
  const [entered, setEntered] = useState<ReadonlySet<number>>(() => new Set());
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const [pageRatios, setPageRatios] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf
      .getPage(1)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setFirstRatio(viewport.height / viewport.width);
      })
      .catch(() => {
        if (!cancelled) setFirstRatio(A4_RATIO);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    if (firstRatio === null || typeof IntersectionObserver === "undefined") return;
    const rail = railRef.current;
    const root = scrollerOf(rail, rootRef.current);
    if (!rail || !root) return;
    const rect = root.getBoundingClientRect();
    const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const half = Math.max(0, height / 2);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!Number.isFinite(page) || page < 1) continue;
          setEntered((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
        }
      },
      { root, rootMargin: `${half}px 0px ${half}px 0px` },
    );
    for (const cell of rail.querySelectorAll<HTMLElement>("[data-page-state]")) {
      observer.observe(cell);
    }
    return () => observer.disconnect();
  }, [firstRatio, state.numPages]);

  // Following the canvas, not driving it: pressing a cell moves the page, and
  // so does `PageDown`, and the rail has to keep up with both.
  useLayoutEffect(() => {
    if (!shown || firstRatio === null) return;
    const page = state.page;
    if (page === lastFollowed.current) return;
    lastFollowed.current = page;

    if (typeof IntersectionObserver === "undefined") {
      const from = Math.max(1, page - PAGES_AROUND_WITHOUT_OBSERVER);
      const to = Math.min(state.numPages, page + PAGES_AROUND_WITHOUT_OBSERVER);
      setEntered((prev) => {
        let next: Set<number> | null = null;
        for (let n = from; n <= to; n += 1) {
          if (prev.has(n)) continue;
          next ??= new Set(prev);
          next.add(n);
        }
        return next ?? prev;
      });
      return;
    }

    const rail = railRef.current;
    const root = scrollerOf(rail, rootRef.current);
    const cell = rail ? findCell(rail, page) : null;
    if (!rail || !root || !cell) return;
    const box = visibleBox(root, rail);
    const rect = cell.getBoundingClientRect();
    if (rect.top >= box.top && rect.bottom <= box.bottom) return;
    const target =
      root.scrollTop +
      (rect.top + rect.bottom) / 2 -
      (box.top + box.bottom) / 2;
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = Math.min(Math.max(target, 0), max);
  }, [shown, firstRatio, state.page, state.numPages]);

  useEffect(() => {
    if (drawn.size <= MAX_DRAWN_PAGES) return;
    const rail = railRef.current;
    const root = scrollerOf(rail, rootRef.current);
    if (!rail || !root) return;
    const box = visibleBox(root, rail);
    const centre = (box.top + box.bottom) / 2;
    const farthest = [...drawn]
      .map((page) => {
        const cell = findCell(rail, page);
        const rect = cell?.getBoundingClientRect();
        return {
          page,
          distance: rect ? Math.abs((rect.top + rect.bottom) / 2 - centre) : 0,
        };
      })
      .sort((a, b) => b.distance - a.distance)
      .slice(0, drawn.size - MAX_DRAWN_PAGES)
      .map(({ page }) => page);
    const evicted = new Set(farthest);
    setDrawn((prev) => without(prev, evicted));
    setEntered((prev) => without(prev, evicted));
  }, [drawn]);

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

  const boxRatio = (page: number) => {
    const own = pageRatios.get(page);
    if (
      firstRatio !== null &&
      own !== undefined &&
      Math.abs(own / firstRatio - 1) > RATIO_TOLERANCE
    ) {
      return own;
    }
    return firstRatio ?? A4_RATIO;
  };

  function markDrawn(page: number, ratio: number) {
    setDrawn((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
    setPageRatios((prev) => {
      if (prev.get(page) === ratio) return prev;
      const next = new Map(prev);
      next.set(page, ratio);
      return next;
    });
  }

  function markFailed(page: number) {
    setFailed((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
    setEntered((prev) => without(prev, new Set([page])));
  }

  return (
    <div
      ref={rootRef}
      className={`flex min-h-0 flex-col gap-4 overflow-y-auto ${className}`}
    >
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

      {firstRatio === null ? (
        <p className="text-sm text-text-muted">{t("pdfLoading")}</p>
      ) : (
        <ol
          ref={railRef}
          aria-label={t("pdfThumbnails")}
          data-testid="pdf-thumbnails"
          className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] items-start gap-x-2 gap-y-3"
        >
          {Array.from({ length: state.numPages }, (_, i) => i + 1).map((n) => {
            const cellState: CellState = failed.has(n)
              ? "failed"
              : drawn.has(n)
                ? "drawn"
                : entered.has(n)
                  ? "drawing"
                  : "placeholder";
            const current = n === state.page;
            const mounted = cellState === "drawing" || cellState === "drawn";
            return (
              <li key={n} className="min-w-0">
                <button
                  type="button"
                  data-page={n}
                  data-page-state={cellState}
                  onClick={() => controller.goToPage(n)}
                  aria-current={current ? "true" : undefined}
                  aria-label={t("pdfGoToPage", { page: n })}
                  className="flex w-full min-w-0 flex-col items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <div
                    className={`relative flex w-full items-center justify-center overflow-hidden rounded-[3px] border border-warm-silver/40 bg-white ${
                      current
                        ? "outline outline-2 outline-offset-2 outline-accent"
                        : ""
                    }`}
                    style={{ aspectRatio: `1 / ${boxRatio(n)}` }}
                  >
                    {mounted && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Page
                          pageNumber={n}
                          width={RASTER_WIDTH}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={null}
                          error={null}
                          onLoadError={() => markFailed(n)}
                          onRenderError={() => markFailed(n)}
                          onRenderSuccess={(rendered) =>
                            markDrawn(n, rendered.originalHeight / rendered.originalWidth)
                          }
                          className="h-full w-full min-h-0! min-w-0! [&>canvas]:h-full! [&>canvas]:w-full! [&>canvas]:object-contain"
                        />
                      </div>
                    )}
                  </div>
                  <span
                    className={`font-mono text-xs leading-4 ${
                      current
                        ? "font-semibold text-accent"
                        : "text-text-muted"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function without(set: ReadonlySet<number>, remove: ReadonlySet<number>): ReadonlySet<number> {
  let next: Set<number> | null = null;
  for (const value of remove) {
    if (!set.has(value)) continue;
    next ??= new Set(set);
    next.delete(value);
  }
  return next ?? set;
}

function scrollerOf(
  rail: HTMLElement | null,
  fallback: HTMLElement | null,
): HTMLElement | null {
  return rail?.closest<HTMLElement>("[data-inspector-scroller]") ?? fallback;
}

function findCell(rail: HTMLElement, page: number): HTMLElement | null {
  return rail.querySelector<HTMLElement>(`[data-page="${page}"]`);
}

/**
 * The box a followed cell is centred in. In the sheet the tab strip is
 * sticky over the scroller, and the offset is published as an inherited
 * custom property on the shell rather than on the scroller above it.
 */
function visibleBox(
  scroller: HTMLElement,
  rail: HTMLElement,
): { top: number; bottom: number } {
  const rect = scroller.getBoundingClientRect();
  const sticky = parseFloat(
    getComputedStyle(rail).getPropertyValue(STICKY_TOP_VAR),
  );
  return {
    top: Math.max(rect.top, 0) + (Number.isFinite(sticky) ? sticky : 0),
    bottom: Math.min(rect.bottom, window.innerHeight),
  };
}

/**
 * `InspectorShell` mounts every panel and hides the ones that are not
 * selected, and mounting this eagerly is not free: pdf.js opens the document
 * a second time behind a `display: none`, for every multi-page PDF, whether
 * or not anyone opens the tab. A hidden element has no layout, so this is
 * exactly what `IntersectionObserver` answers.
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
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = useHasBeenVisible(hostRef);

  if (!visible) {
    return <div ref={hostRef} className="h-full w-full" />;
  }

  return <PdfPagesPanel controller={controller} className="h-full p-2" />;
}
