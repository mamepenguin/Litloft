export type ReaderKey = "f" | "Escape";

/** The reader truncates labels to this length and sends at most this many entries. */
export const TOC_LABEL_MAX = 200;
export const TOC_MAX = 1000;

export interface TocEntry {
  label: string;
  depth: number;
  /** Start of the section the entry opens; null when its target does not resolve. */
  fraction: number | null;
}

export type ReaderMessage =
  | { type: "boot" }
  | { type: "ready"; dir: "ltr" | "rtl"; vertical: boolean; toc: TocEntry[] }
  | { type: "location"; fraction: number; tocIndex: number | null; pagesLeft: number | null }
  | { type: "activity"; kind: "tap" | "pointer" | "key" }
  | { type: "seeked"; id: number }
  | { type: "turned"; fraction: number; atEnd: boolean }
  | { type: "key"; key: ReaderKey }
  | { type: "link"; url: string }
  | { type: "error"; code: "unsupported" | "parse" | "isolation" };

export type ReaderCommand =
  | { type: "open"; bytes: ArrayBuffer; fraction: number | null; theme: "light" | "dark" }
  | { type: "turn"; direction: "next" | "prev" | "left" | "right" }
  | { type: "seek"; fraction: number; id: number }
  | { type: "theme"; theme: "light" | "dark" }
  | { type: "mode"; fullscreen: boolean };

const KEYS: ReadonlySet<string> = new Set<ReaderKey>(["f", "Escape"]);
const ERRORS: ReadonlySet<string> = new Set(["unsupported", "parse", "isolation"]);

function isFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

const BLANK_ENTRY: TocEntry = { label: "", depth: 0, fraction: null };

function parseTocEntry(item: unknown): TocEntry {
  if (!item || typeof item !== "object") return BLANK_ENTRY;
  const { label, depth, fraction } = item as Record<string, unknown>;
  if (typeof label !== "string" || label.length > TOC_LABEL_MAX) return BLANK_ENTRY;
  if (!isCount(depth)) return BLANK_ENTRY;
  if (fraction !== null && !isFraction(fraction)) return BLANK_ENTRY;
  return { label, depth, fraction };
}

/**
 * A bad table of contents costs the reader its entries, never the book: a
 * dropped `ready` would leave the page loading for good. A bad entry is
 * blanked, not removed, because the reader names entries by position.
 */
function parseToc(value: unknown): TocEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, TOC_MAX).map(parseTocEntry);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The reader document shares this page's origin, so a book script that got
 * past both of its defences could post here as the reader. Only the reader
 * frame's own window is heard, and only in the contract's shapes.
 */
export function parseReaderMessage(
  event: MessageEvent,
  readerWindow: Window | null,
): ReaderMessage | null {
  if (!readerWindow || event.source !== readerWindow) return null;
  if (event.origin !== window.location.origin) return null;
  const d: unknown = event.data;
  if (!d || typeof d !== "object") return null;
  const m = d as Record<string, unknown>;
  switch (m.type) {
    case "boot":
      return { type: "boot" };
    case "ready":
      if ((m.dir !== "ltr" && m.dir !== "rtl") || typeof m.vertical !== "boolean") return null;
      return { type: "ready", dir: m.dir, vertical: m.vertical, toc: parseToc(m.toc) };
    case "location":
      if (!isFraction(m.fraction)) return null;
      if (m.tocIndex !== null && !isCount(m.tocIndex)) return null;
      if (m.pagesLeft !== null && !isCount(m.pagesLeft)) return null;
      return { type: "location", fraction: m.fraction, tocIndex: m.tocIndex, pagesLeft: m.pagesLeft };
    case "seeked":
      if (!isCount(m.id)) return null;
      return { type: "seeked", id: m.id };
    case "activity":
      if (m.kind !== "tap" && m.kind !== "pointer" && m.kind !== "key") return null;
      return { type: "activity", kind: m.kind };
    case "turned":
      if (!isFraction(m.fraction) || typeof m.atEnd !== "boolean") return null;
      return { type: "turned", fraction: m.fraction, atEnd: m.atEnd };
    case "key":
      if (typeof m.key !== "string" || !KEYS.has(m.key)) return null;
      return { type: "key", key: m.key as ReaderKey };
    case "link":
      if (!isHttpUrl(m.url)) return null;
      return { type: "link", url: m.url };
    case "error":
      if (typeof m.code !== "string" || !ERRORS.has(m.code)) return null;
      return { type: "error", code: m.code as "unsupported" | "parse" | "isolation" };
    default:
      return null;
  }
}

export function postToReader(
  readerWindow: Window | null,
  command: ReaderCommand,
  transfer?: Transferable[],
): void {
  readerWindow?.postMessage(command, window.location.origin, transfer);
}
