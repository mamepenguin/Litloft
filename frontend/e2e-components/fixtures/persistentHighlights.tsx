/**
 * The real PDF and Markdown viewers, with a fake highlights server and a
 * stand-in for the Knowledge quote button, so the browser suite can measure a
 * selection, a text layer rebuild and the two controls side by side.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Quote } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";

import { MarkdownPreview } from "@/components/MarkdownPreview";
import { PdfPreview } from "@/components/PdfPreview";
import { PdfFullscreenViewer } from "@/components/pdf/PdfFullscreenViewer";
import { Document, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import { FindProvider, FindTextBodyProvider } from "@/components/FileDetail/find/FindContext";
import { ProfileProvider, useProfile } from "@/components/ProfileProvider";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { HighlightFileContext } from "@/lib/highlightStore";
import type { FindContextValue } from "@/components/FileDetail/find/types";
import type { Highlight } from "@/types";
import enMessages from "@/messages-core/en.json";

const FILE = "fixture-file";
const ARRANGEMENT_ID = "persistent-highlights";

const PDF_PAGES = [
  "Quarterly report First page",
  "Second page body",
  "Third page body",
];

/**
 * The fixture page is opened from `file://`, where Chrome refuses to load the
 * worker module beside the bundle. A blob URL carries the same code without a
 * cross-origin fetch.
 */
const pdfWorkerUrl = URL.createObjectURL(
  new Blob([pdfWorkerSource], { type: "text/javascript" }),
);
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * pdf.js opens a `file://` stream with `XMLHttpRequest`, which Chrome refuses
 * cross-origin. The same bytes in a blob URL are same-origin with this page.
 */
const pdfBlobUrl = URL.createObjectURL(
  new Blob([buildPdf(PDF_PAGES).buffer as ArrayBuffer], {
    type: "application/pdf",
  }),
);
const nativeXhrOpen = XMLHttpRequest.prototype.open as unknown as (
  this: XMLHttpRequest,
  ...args: unknown[]
) => void;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  const target = String(url).includes(`/api/files/${FILE}/stream`)
    ? pdfBlobUrl
    : url;
  return nativeXhrOpen.call(this, method, target, ...rest);
} as typeof XMLHttpRequest.prototype.open;

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** A three-page PDF whose pages each carry one line of real text. */
function buildPdf(pages: readonly string[]): Uint8Array {
  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    const content =
      `BT /F1 20 Tf 72 720 Td (${escapePdfText(pages[index])}) Tj ET`;
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  objects[2] =
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let object = 1; object < objects.length; object += 1) {
    offsets[object] = output.length;
    output += `${object} 0 obj\n${objects[object]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let object = 1; object < objects.length; object += 1) {
    output += `${String(offsets[object]).padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface FakeServer {
  rows: Highlight[];
  next: number;
}

let fakeServer: FakeServer | null = null;
let fetchInstalled = false;

function installFetch(): void {
  if (fetchInstalled) return;
  fetchInstalled = true;
  fakeServer = { rows: [], next: 1 };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes(`/api/files/${FILE}/highlights`)) {
      const server = fakeServer!;
      if (method === "GET") return Promise.resolve(json(server.rows));
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          page: number | null;
          quote: string;
          prefix: string;
          suffix: string;
        };
        // The browser suite watches the real request, and this fixture answers
        // from memory. A localhost URL that refuses the connection keeps the
        // request observable; `file:` never reaches Chromium's request log.
        const parsed = new URL(url, window.location.href);
        void nativeFetch(
          `http://127.0.0.1:65535${parsed.pathname}${parsed.search}`,
          init,
        ).catch(() => undefined);
        const duplicate = server.rows.find(
          (row) =>
            row.page === (body.page ?? null) &&
            row.quote === body.quote &&
            row.prefix === body.prefix &&
            row.suffix === body.suffix,
        );
        if (duplicate) return Promise.resolve(json(duplicate));
        const record: Highlight = {
          id: `srv${String(server.next++).padStart(9, "0")}`,
          page: body.page ?? null,
          quote: body.quote,
          prefix: body.prefix,
          suffix: body.suffix,
          created_at: new Date().toISOString(),
        };
        server.rows.push(record);
        return Promise.resolve(json(record, 201));
      }
      if (method === "DELETE") {
        const id = url.split("?")[0].split("/").pop() ?? "";
        server.rows = server.rows.filter((row) => row.id !== id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    }

    if (url.includes(`/api/files/${FILE}/progress`)) {
      if (method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json({ position: 0, duration: 0 }));
    }
    if (url.includes(`/api/files/${FILE}/wiki-resolutions`)) {
      return Promise.resolve(json({}));
    }
    if (url.includes(`/api/files/${FILE}/stream`)) {
      return Promise.resolve(
        new Response(buildPdf(PDF_PAGES).buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      );
    }
    return nativeFetch(input, init);
  };
}

function useFixtureProfile(name: string | null): boolean {
  const { nickname, setNickname } = useProfile();
  useEffect(() => {
    if (name !== null && nickname !== name) setNickname(name);
  }, [name, nickname, setNickname]);
  return name === null || nickname === name;
}

function ProfileGate({
  name,
  children,
}: {
  name: string | null;
  children: ReactNode;
}): ReactElement {
  const ready = useFixtureProfile(name);
  return <>{ready ? children : null}</>;
}

function QuoteStandIn({
  getContainer,
}: {
  getContainer: () => HTMLElement | null;
}): ReactElement | null {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const getContainerRef = useRef(getContainer);
  getContainerRef.current = getContainer;

  useEffect(() => {
    const update = () => {
      const container = getContainerRef.current();
      const selection = window.getSelection();
      if (
        !container ||
        !selection ||
        selection.rangeCount !== 1 ||
        selection.isCollapsed
      ) {
        setPosition(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.startContainer)) {
        setPosition(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPosition({
        left: Math.min(
          window.innerWidth - 44,
          Math.max(8, rect.left + rect.width / 2 - 18),
        ),
        top: Math.max(8, rect.top - 44),
      });
    };
    document.addEventListener("selectionchange", update);
    update();
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  if (!position) return null;
  return createPortal(
    <div className="fixed z-50" style={position}>
      <button
        type="button"
        data-testid="quote-button"
        aria-label="Quote"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bg-border bg-bg-card text-text-muted shadow-card"
      >
        <Quote size={16} />
      </button>
    </div>,
    document.body,
  );
}

function MarkdownDoc(): ReactElement {
  const [source, setSource] = useState("Alpha Beta Gamma Beta");
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const find = useMemo<FindContextValue>(
    () => ({
      enabled: true,
      shortcutEnabled: false,
      open: true,
      query,
      status: query
        ? {
            kind: "hits",
            answer: {
              query,
              indexed: true,
              total: 1,
              truncated: false,
              rows: [],
            },
          }
        : { kind: "idle" },
      filter: "all",
      rows: [],
      visibleRows: [],
      currentRow: null,
      currentIndex: null,
      truncated: false,
      focusNonce: 0,
      selectRequest: null,
      openFind: () => undefined,
      closeFind: () => undefined,
      openFindByShortcut: () => false,
      changeQuery: () => undefined,
      commitQuery: () => undefined,
      compositionStart: () => undefined,
      compositionEnd: () => undefined,
      keyDown: () => undefined,
      step: () => undefined,
      selectRow: () => undefined,
      selectFilter: () => undefined,
      retry: () => undefined,
      reportTab: () => undefined,
      registerUrlStrip: () => undefined,
    }),
    [query],
  );

  return (
    <>
      <div className="flex items-center gap-2 p-2">
        <input
          aria-label="Find"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded border border-bg-border bg-bg-card px-2 py-1 text-sm"
        />
        {editing ? (
          <button type="button" onClick={() => setEditing(false)}>
            Preview
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSource((current) =>
                current === "Alpha Beta Gamma Beta"
                  ? "Alpha Beta Gamma! Beta"
                  : "Alpha Beta Gamma Beta",
              );
            }}
          >
            Edit source
          </button>
        )}
      </div>
      <div ref={containerRef}>
        {editing ? null : (
          <FindProvider value={find}>
            <FindTextBodyProvider>
              <MarkdownPreview source={source} />
            </FindTextBodyProvider>
          </FindProvider>
        )}
      </div>
      <QuoteStandIn getContainer={() => containerRef.current} />
    </>
  );
}

function PdfDoc(): ReactElement {
  const [fullscreen, setFullscreen] = useState(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  return (
    <>
      <style>{`
        .persistent-highlights-inline [aria-label="Full screen"] {
          display: none !important;
        }
      `}</style>
      {!fullscreen && (
        <div className="persistent-highlights-inline">
          <PdfPreview fileId={FILE} title="Quarterly report" />
        </div>
      )}
      {!fullscreen && (
        <button type="button" onClick={() => setFullscreen(true)}>
          Full screen
        </button>
      )}
      {fullscreen && (
        <Document file={pdfBlobUrl} onLoadSuccess={setPdf}>
          {pdf && (
            <PdfFullscreenViewer
              pdf={pdf}
              fileId={FILE}
              title="Quarterly report"
              initialPage={1}
              onClose={() => setFullscreen(false)}
            />
          )}
        </Document>
      )}
      {/* A second page's text layer for the span-a-page selection: the real
          inline viewer draws one page at a time. */}
      <div
        className="textLayer"
        aria-hidden
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "500px",
          height: "100px",
        }}
      >
        <span>Second page body</span>
      </div>
    </>
  );
}

export function PersistentHighlightsArrangement(): ReactElement {
  const params = new URLSearchParams(location.search);
  const doc = params.get("doc") === "markdown" ? "markdown" : "pdf";
  const profile = params.get("profile") === "alice" ? "alice" : null;
  const [ready, setReady] = useState(false);

  installFetch();

  useEffect(() => {
    const check = () => {
      if (doc === "markdown") {
        if (document.querySelector(".markdown-body p")) setReady(true);
        return;
      }
      const layers = document.querySelectorAll(".textLayer");
      for (const layer of Array.from(layers)) {
        if (layer.textContent?.includes("Quarterly")) {
          setReady(true);
          return;
        }
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    check();
    return () => observer.disconnect();
  }, [doc]);

  useEffect(() => {
    if (ready) document.body.dataset.arrangement = ARRANGEMENT_ID;
  }, [ready]);

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutsProvider>
        <ProfileProvider>
          <ProfileGate name={profile}>
            <HighlightFileContext.Provider value={FILE}>
              {doc === "markdown" ? <MarkdownDoc /> : <PdfDoc />}
            </HighlightFileContext.Provider>
          </ProfileGate>
        </ProfileProvider>
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}
