import { vi, type Mock } from "vitest";

import type { FileItem } from "@/types";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const DOC_MIME = "application/msword";
export const XLS_MIME = "application/vnd.ms-excel";
export const PPT_MIME = "application/vnd.ms-powerpoint";

export const FALLBACK_HEADING = "This kind of file cannot be shown in a browser";

export function officeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "doc-a",
    filename: "spec.docx",
    title: "Spec",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: DOCX_MIME,
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4096,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    modified_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as FileItem;
}

export const streamUrl = (id: string) => `/api/files/${id}/stream`;
export const previewTextUrl = (id: string) => `/api/files/${id}/preview-text`;
export const excerptOf = (id: string) => `excerpt of ${id}`;

/** The body of a stream answer carries the file id, so a drawing can name the file it was handed. */
function bodyFor(id: string): ArrayBuffer {
  return new TextEncoder().encode(`file:${id}`).buffer as ArrayBuffer;
}

export async function idOfBody(data: unknown): Promise<string> {
  let bytes: Uint8Array;
  if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (ArrayBuffer.isView(data))
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
  else return "?";
  return new TextDecoder().decode(bytes).replace(/^file:/, "");
}

export function idOfBodySync(data: unknown): string {
  if (data instanceof ArrayBuffer)
    return new TextDecoder().decode(new Uint8Array(data)).replace(/^file:/, "");
  if (ArrayBuffer.isView(data))
    return new TextDecoder()
      .decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      .replace(/^file:/, "");
  return "?";
}

interface StreamCall {
  id: string;
  init: RequestInit | undefined;
}

type StreamAnswer = () => Promise<unknown>;

export interface Held {
  respond: () => void;
  fail: (err: unknown) => void;
}

export interface Network {
  fetch: Mock;
  streamCalls: (id?: string) => StreamCall[];
  previewTextCalls: () => string[];
  /** The order of every request the page made, as `stream:<id>` / `preview-text:<id>`. */
  log: string[];
  answerStream: (id: string, answer: StreamAnswer) => void;
  failStream: (id: string, status: number) => void;
  rejectStream: (id: string, err: unknown) => void;
  holdStream: (id: string) => Held;
}

function okStream(id: string) {
  const buf = bodyFor(id);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/octet-stream" }),
    arrayBuffer: async () => buf,
    blob: async () => new Blob([buf]),
  };
}

function statusStream(status: number) {
  return {
    ok: false,
    status,
    statusText: String(status),
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob([]),
    text: async () => "",
    json: async () => ({}),
  };
}

export function installNetwork(): Network {
  const streams: StreamCall[] = [];
  const previews: string[] = [];
  const log: string[] = [];
  const answers = new Map<string, StreamAnswer>();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const stream = path.match(/^\/api\/files\/([^/?]+)\/stream$/);
    if (stream) {
      const id = decodeURIComponent(stream[1]);
      streams.push({ id, init });
      log.push(`stream:${id}`);
      const answer = answers.get(id);
      return answer ? answer() : okStream(id);
    }
    const preview = path.match(/^\/api\/files\/([^/?]+)\/preview-text/);
    if (preview) {
      const id = decodeURIComponent(preview[1]);
      previews.push(id);
      log.push(`preview-text:${id}`);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        text: async () => excerptOf(id),
      };
    }
    log.push(`other:${path}`);
    return statusStream(404);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetch: fetchMock,
    streamCalls: (id) => (id ? streams.filter((c) => c.id === id) : [...streams]),
    previewTextCalls: () => [...previews],
    log,
    answerStream: (id, answer) => answers.set(id, answer),
    failStream: (id, status) => answers.set(id, async () => statusStream(status)),
    rejectStream: (id, err) =>
      answers.set(id, () => Promise.reject(err)),
    holdStream: (id) => {
      let resolve!: (v: unknown) => void;
      let reject!: (e: unknown) => void;
      const p = new Promise<unknown>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      answers.set(id, () => p);
      return {
        respond: () => resolve(okStream(id)),
        fail: (err) => reject(err),
      };
    },
  };
}

export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class InertResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** The `drawn:` texts in the document right now. */
export function drawnNow(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent?.startsWith("drawn:")) out.push(n.textContent);
  }
  return out;
}

export function drawnBy(id: string, extra = ""): HTMLElement {
  const el = document.createElement("div");
  el.textContent = `drawn:${id}${extra}`;
  return el;
}

/** The arguments of every `console.warn` call, each joined into one string. */
export function warnings(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((args) =>
    args
      .map((a: unknown) =>
        a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a),
      )
      .join(" "),
  );
}
