"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
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
import { readStored, writeStored } from "@/lib/safeStorage";
import {
  DEFAULT_PDF_ZOOM_MODE,
  PDF_ZOOM_MODES,
  PDF_ZOOM_MODE_KEY,
  parsePdfZoomMode,
  pdfPageWidth,
  type PageBox,
  rasterPixelRatio,
  type PdfZoomMode,
} from "@/lib/pdfZoomMode";
import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { COMPOSITION_GRACE_MS, IME_KEY_CODE } from "@/lib/ime";
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

/**
 * The message key for each mode, spelled out.
 *
 * What this buys is exhaustiveness, not key checking. `satisfies
 * Record<PdfZoomMode, string>` makes adding or renaming a mode a type
 * error here, where the label it needs is decided.
 *
 * It does not catch a typo in the key itself: next-intl only checks keys
 * against an augmented `AppConfig["Messages"]`, this frontend augments
 * nothing, so `Messages` is `Record<string, any>` and `t` accepts any
 * string. That is also why the `as never` casts this replaced were
 * turning off a check that was never on — they read as if it were.
 */
const MODE_LABEL_KEY = {
  "fit-width": "pdfZoomMode_fit-width",
  "fit-page": "pdfZoomMode_fit-page",
  actual: "pdfZoomMode_actual",
} as const satisfies Record<PdfZoomMode, string>;

/**
 * `p-4` top plus bottom, at the default root font size.
 *
 * The fallback only, for environments that compute no styles — jsdom, in
 * this project. Everywhere else the padding is read off the element,
 * because `p-4` is `1rem` and a reader whose browser default is 20px has
 * 40px of it, not 32; a hard 32 there fits every "whole page" 8px too
 * tall and gives the mode the permanent scrollbar it exists to avoid.
 */
const PAGE_BOX_PADDING_Y = 32;

/**
 * The scroll box's vertical padding, in used pixels.
 *
 * `getComputedStyle` resolves the `rem` that the class is written in.
 * The test pins `p-4` on the element so the fallback above cannot drift
 * away from the class it names.
 */
function pageBoxPaddingY(box: Element): number {
  const style = getComputedStyle(box);
  const top = parseFloat(style.paddingTop);
  const bottom = parseFloat(style.paddingBottom);
  return Number.isFinite(top) && Number.isFinite(bottom)
    ? top + bottom
    : PAGE_BOX_PADDING_Y;
}

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
  // The scroll box's height, for "whole page". Its own measurement
  // rather than a share of the viewport: §7's floor makes the box a
  // fraction of the canvas, which is not the window.
  const [availableHeight, setAvailableHeight] = useState(600);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  /** The current page's size in PDF points, once the document says. */
  const [pageBox, setPageBox] = useState<PageBox | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>(DEFAULT_PDF_ZOOM_MODE);
  const [renderFailed, setRenderFailed] = useState(false);

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
   * What this mount last loaded.
   *
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
    setPageDraft(null);
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
    // One observer, on the scroll box. Two axes, read from two of that
    // element's boxes, because each has to be immune to a different
    // scrollbar.
    //
    // Width comes from the content box, which excludes `p-4` and the
    // vertical scrollbar's gutter — reserved unconditionally below, so
    // the number does not move when the scrollbar comes and goes.
    //
    // Height comes from the *border* box, minus that same padding. The
    // content box would be the tidier read, but a horizontal scrollbar
    // takes its thickness out of it, and `fit-page` turns height into
    // width: a shorter box makes a narrower page, a narrower page
    // retires the scrollbar, the height grows back. The border box is
    // `h-[80vh]` whether or not anything is scrolling.
    //
    // Neither number is a function of the page any more, which is what
    // makes the cycle unavailable rather than merely unlikely.
    //
    // What it costs: when a horizontal scrollbar *is* drawn — above zoom
    // 1, or in a box narrower than `MIN_FITTED_WIDTH`, where the fit
    // functions floor the width above `available` — the height still
    // reads as though it were not, so it overstates the visible height by
    // the scrollbar's own thickness. That is ~15px classic, 0 overlay,
    // and it makes a fitted page about 10px wider than a true fit. The
    // page was already overflowing in that state.
    //
    // `borderBoxSize` postdates `ResizeObserver` itself, so the guard at
    // the top of this effect does not cover it. Falling back to the
    // content box restores the merely-imperfect reading rather than
    // throwing inside the callback and freezing the height at its
    // default.
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

  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const compositionEndedAtRef = useRef(0);

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
   * A draft is about the page it was typed on top of.
   *
   * The page can move underneath it — an Ask citation arriving as a new
   * `initialPage`, or a press in the page list — and a box still reading `9`
   * while the canvas is on 3 is a counter that lies about where the reader
   * is, with nothing to make it stop.
   */
  useEffect(() => {
    setPageDraft(null);
  }, [page]);

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
            const target = resolved[0];
            // Most destinations name a page by reference, which only the
            // document can resolve. Some name it by 0-based index outright,
            // and `getPageIndex` throws on those — a table of contents whose
            // rows were all dead because every one of them took the wrong
            // branch is indistinguishable from a document with no outline.
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
      setPage((current) => Math.min(Math.max(1, current), count));
      void loadOutline(pdf);
    },
    [loadOutline],
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
   * Whether the reader is inside the viewer.
   *
   * §8 (b) scopes the page keys to "while the viewer is in the focus scope",
   * and the reason is concrete: `ShortcutsProvider` calls `preventDefault` on
   * every match, so an unscoped binding stops `PageDown` scrolling the
   * inspector — whose panel is `tabIndex={0}` precisely so a keyboard reader
   * can scroll it — and stops it scrolling a page zoomed past the canvas box.
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
    numPages > 1 && inScope,
  );

  /**
   * Held apart from the rest of the toolbar's render.
   *
   * Every keystroke in the page box is a state change, and a 225-page PDF
   * cannot afford to re-render the canvas on each of them. The element
   * depends on the page and the width and on nothing else, so a draft the
   * reader has not confirmed yet costs a toolbar render and no more.
   */
  const baseWidth = pdfPageWidth({
    mode: zoomMode,
    available: availableWidth,
    availableHeight,
    pageBox,
  });

  const drawWidth = baseWidth * zoom;

  const pageElement = useMemo(
    () => (
      <Page
        pageNumber={page}
        width={drawWidth}
        // A budget for pixels, not for layout. The page keeps the size
        // the mode promises; only the raster behind it gets coarser, and
        // only where the browser would otherwise refuse the allocation
        // and paint nothing. See `rasterPixelRatio`.
        devicePixelRatio={rasterPixelRatio({
          cssWidth: drawWidth,
          cssHeight: pageBox
            ? drawWidth * (pageBox.height / pageBox.width)
            : drawWidth,
          devicePixelRatio:
            typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        })}
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
        renderTextLayer
        renderAnnotationLayer
      />
    ),
    [page, drawWidth, pageBox],
  );

  /**
   * Set for the length of one blur, by the Escape path.
   *
   * `blur()` re-enters React's `onBlur` synchronously, and the handler there
   * closes over the `pageDraft` from *before* `setPageDraft(null)` — so
   * Escape committed the number it was meant to throw away. A ref is read at
   * the moment the blur runs, which a state update is not.
   */
  const abandoningRef = useRef(false);

  const commitPageInput = () => {
    if (abandoningRef.current) {
      abandoningRef.current = false;
      setPageDraft(null);
      return;
    }
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
            onCompositionEnd={() => {
              compositionEndedAtRef.current = Date.now();
            }}
            onKeyDown={(e) => {
              // An IME is mid-conversion: every key belongs to it. And the
              // key that *confirms* a conversion arrives afterwards looking
              // exactly like a bare press, which is why `lib/ime.ts` exists
              // and why the grace window is needed as well as `isComposing`.
              // `InlineNameEditor` is the same shape of field and guards the
              // same way; this box was the only Enter/Escape field that did
              // not.
              if (e.nativeEvent.isComposing || e.keyCode === IME_KEY_CODE)
                return;
              if (
                (e.key === "Enter" || e.key === "Escape") &&
                Date.now() - compositionEndedAtRef.current <
                  COMPOSITION_GRACE_MS
              ) {
                compositionEndedAtRef.current = 0;
                return;
              }

              if (e.key === "Enter") {
                e.preventDefault();
                commitPageInput();
                pageInputRef.current?.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                // Both halves: the state update is what puts the box back,
                // and the ref is what stops the blur this triggers from
                // committing the draft it still closes over.
                abandoningRef.current = true;
                setPageDraft(null);
                pageInputRef.current?.blur();
              }
            }}
            // Sized by the page count's digits, so a 9-page document does not
            // carry a box built for 2000.
            style={{ width: `${String(numPages || 1).length + 2}ch` }}
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

      <div
        ref={pageBoxRef}
        // `safe center`, not `center`. A flex container centres an
        // overflowing child by pushing half the overflow past its *start*
        // edge, and there is nothing to scroll to there: measured on an
        // A0 page at actual size, 1176px of a 3178px page was
        // unreachable. `safe` falls back to `start` exactly when the
        // child does not fit, which is the case where centring has
        // nothing to centre anyway.
        //
        // The gutter reservation is load-bearing, not cosmetic. Without
        // it a classic vertical scrollbar takes its width out of
        // `contentRect.width` when it appears, and `fit-width` oscillates:
        // a wider box makes a taller page, a taller page raises the
        // scrollbar, the scrollbar narrows the box, the shorter page
        // retires it. Reserving the gutter unconditionally makes the width
        // the same number in both states. Overlay scrollbars (macOS) never
        // took the width in the first place, and the property is inert
        // there.
        //
        // `both-edges`, not plain `stable`, and the second word is the
        // one doing the work. In "whole page" the page is fitted to the
        // height and no vertical scrollbar is ever drawn, so a one-sided
        // reservation stays empty and `safe center` centres the page
        // inside the box that strip was taken out of: on classic
        // scrollbars the page sits ~15px left of true centre. The mode is
        // called "whole page", and what that name promises is the page
        // entire and centred — a position decided by which side the
        // browser keeps its scrollbar on is not that. Reserving the same
        // strip on both edges makes the centring true, and makes it the
        // same in every mode, so switching modes moves the page's size
        // and nothing else.
        //
        // Where the property is unsupported (Safari before 18.2) *and*
        // scroll bars are set to always show, the oscillation above comes
        // back exactly as it was. That pairing is rare because the
        // platform without the property is usually the platform with
        // overlay scrollbars, but it is a setting, not an impossibility.
        className="flex h-[80vh] [justify-content:safe_center] overflow-auto [scrollbar-gutter:stable_both-edges] bg-bg-elevated p-4"
      >
        <Document
          file={src}
          onLoadSuccess={handleLoad}
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
        </Document>
      </div>
    </div>
  );
}
