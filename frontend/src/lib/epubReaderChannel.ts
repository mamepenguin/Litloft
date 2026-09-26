export type ReaderKey = "ArrowLeft" | "ArrowRight" | "f" | "Escape";

export type ReaderMessage =
  | { type: "boot" }
  | { type: "ready"; dir: "ltr" | "rtl"; vertical: boolean }
  | { type: "turned"; fraction: number; atEnd: boolean }
  | { type: "key"; key: ReaderKey }
  | { type: "link"; url: string }
  | { type: "error"; code: "unsupported" | "parse" | "isolation" };

export type ReaderCommand =
  | { type: "open"; bytes: ArrayBuffer; fraction: number | null; theme: "light" | "dark" }
  | { type: "turn"; direction: "next" | "prev" | "left" | "right" }
  | { type: "theme"; theme: "light" | "dark" }
  | { type: "mode"; fullscreen: boolean };

const KEYS: ReadonlySet<string> = new Set<ReaderKey>(["ArrowLeft", "ArrowRight", "f", "Escape"]);
const ERRORS: ReadonlySet<string> = new Set(["unsupported", "parse", "isolation"]);

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
      return { type: "ready", dir: m.dir, vertical: m.vertical };
    case "turned":
      if (
        typeof m.fraction !== "number" ||
        !Number.isFinite(m.fraction) ||
        m.fraction < 0 ||
        m.fraction > 1 ||
        typeof m.atEnd !== "boolean"
      ) {
        return null;
      }
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
