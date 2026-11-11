import type { LitloftClient } from "../client.js";

export const MB = 1024 * 1024;
export const FULL_READ_MAX_BYTES = MB;
export const RANGED_READ_MAX_BYTES = 10 * MB;
export const RANGED_OUTPUT_MAX_BYTES = MB;

// Mirrors backend/app/routers/files.py _TEXT_WRITE_ALLOWED_MIMES /
// _TEXT_WRITE_MAX_BYTES: the only files PUT /content accepts.
export const EDITABLE_MIMES = new Set(["text/markdown", "text/plain"]);
export const EDITABLE_MAX_BYTES = MB;

export interface FileMeta {
  mime_type?: string | null;
  file_size?: number;
}

export interface TextBody {
  bytes: Uint8Array;
  etag: string | null;
}

export function getFileMeta(client: LitloftClient, fileId: string): Promise<FileMeta> {
  return client.request<FileMeta>("GET", `/api/files/${encodeURIComponent(fileId)}`);
}

export async function readTextBody(client: LitloftClient, fileId: string): Promise<TextBody> {
  const res = await client.requestBytes("GET", `/api/files/${encodeURIComponent(fileId)}/stream`);
  return { bytes: res.bytes, etag: res.etag };
}

// ignoreBOM keeps a leading byte-order mark as U+FEFF, so re-encoding the
// text gives back the stored bytes; Response.text() would drop it.
export function decodeUtf8(bytes: Uint8Array, fatal: boolean): string {
  return new TextDecoder("utf-8", { ignoreBOM: true, fatal }).decode(bytes);
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Lines with their own terminators; a final unterminated line counts, empty text has none. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export interface LineRange {
  content: string;
  etag: null;
  start_line: number;
  end_line: number;
  total_lines: number;
  truncated: boolean;
}

export type RangeOutcome = LineRange | { tooLongLine: number };

export function selectLines(text: string, offset: number, limit: number | undefined): RangeOutcome {
  const lines = splitLines(text);
  const last = limit === undefined ? lines.length : Math.min(lines.length, offset - 1 + limit);
  const picked: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (let i = offset - 1; i < last; i += 1) {
    const size = utf8Length(lines[i]);
    if (bytes + size > RANGED_OUTPUT_MAX_BYTES) {
      if (picked.length === 0) return { tooLongLine: i + 1 };
      truncated = true;
      break;
    }
    picked.push(lines[i]);
    bytes += size;
  }
  return {
    content: picked.join(""),
    etag: null,
    start_line: offset,
    end_line: offset - 1 + picked.length,
    total_lines: lines.length,
    truncated,
  };
}

export function isReadableMime(mime: string | null | undefined): boolean {
  return !!mime && (mime.startsWith("text/") || mime === "application/json");
}
