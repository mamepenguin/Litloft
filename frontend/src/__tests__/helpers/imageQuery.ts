import { vi } from "vitest";

export const AVAILABLE_PATH = "/api/addons/intelligence/search/by-image/available";
export const SEARCH_PATH = "/api/addons/intelligence/search/by-image";
export const LIMIT_BYTES = 20 * 1024 * 1024;
export const IMG_URL = /^\/drive\/([^/?]+)\/search\?img=([0-9a-f]{12})$/;

export interface SentRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | null;
  respond: (status: number, body?: unknown) => void;
  fail: () => void;
}

export interface Availability {
  status: number;
  body?: unknown;
  network?: boolean;
  never?: boolean;
}

/**
 * Stands in for `fetch`: the availability route answers per drive from
 * `availability`, each image query waits until the test responds to it, and
 * any other URL fails the test.
 */
export function installFetch(availability: Availability = { status: 200, body: {} }) {
  const asked: Array<{ drive: string | null }> = [];
  const searches: SentRequest[] = [];
  const state = { availability, ignoreAbort: false };

  const json = (status: number, body: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body ?? null)),
      clone() {
        return this;
      },
    }) as unknown as Response;

  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
    const path = new URL(url, "http://localhost").pathname;
    if (path === AVAILABLE_PATH) {
      asked.push({ drive: headers.get("X-Lit-Drive") });
      const a = state.availability;
      if (a.never) return new Promise<Response>(() => {});
      if (a.network) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(json(a.status, a.body ?? {}));
    }
    if (path === SEARCH_PATH) {
      return new Promise<Response>((resolve, reject) => {
        const signal = init.signal ?? null;
        signal?.addEventListener("abort", () => {
          if (!state.ignoreAbort) reject(new DOMException("The operation was aborted.", "AbortError"));
        });
        searches.push({
          url,
          method: (init.method ?? "GET").toUpperCase(),
          headers,
          body: init.body,
          signal,
          respond: (status, body) => resolve(json(status, body)),
          fail: () => reject(new TypeError("Failed to fetch")),
        });
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    asked,
    searches,
    setAvailability(next: Availability) {
      state.availability = next;
    },
    /** Let a request answer after its abort, as a response already on the wire would. */
    answerAfterAbort() {
      state.ignoreAbort = true;
    },
  };
}

export function installObjectUrls() {
  let n = 0;
  const created: string[] = [];
  const revoked: string[] = [];
  const create = vi.fn(() => {
    n += 1;
    const url = `blob:test/${n}`;
    created.push(url);
    return url;
  });
  const revoke = vi.fn((url: string) => {
    revoked.push(url);
  });
  Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
  return { created, revoked };
}

export function imageFile(name = "shot.png", type = "image/png", bytes: Uint8Array<ArrayBuffer> = new Uint8Array([137, 80, 78, 71, 1, 2, 3])) {
  return new File([bytes], name, { type });
}

export function sizedFile(size: number, name = "photo.jpg", type = "image/jpeg") {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[size - 1] = 0xd9;
  return new File([bytes], name, { type });
}

interface Item {
  kind: "file" | "string";
  type: string;
  getAsFile: () => File | null;
  getAsString?: (cb: (s: string) => void) => void;
  webkitGetAsEntry?: () => unknown;
}

function fileItem(file: File | null, type?: string): Item {
  return {
    kind: "file",
    type: type ?? file?.type ?? "",
    getAsFile: () => file,
    webkitGetAsEntry: () => (file ? { isFile: true, isDirectory: false, name: file.name } : null),
  };
}

function listOf<T>(values: T[]) {
  const list = Object.assign([...values], {
    item: (i: number) => values[i] ?? null,
  });
  return list;
}

/** A paste's `clipboardData`: files, and `text/plain` when given. */
export function clipboard(files: Array<File | null>, plain?: string) {
  const realFiles = files.filter((f): f is File => f !== null);
  const items: Item[] = files.map((f) => fileItem(f, f?.type ?? "image/png"));
  if (plain !== undefined) {
    items.push({
      kind: "string",
      type: "text/plain",
      getAsFile: () => null,
      getAsString: (cb) => cb(plain),
    });
  }
  const types = [...(realFiles.length || files.length ? ["Files"] : []), ...(plain !== undefined ? ["text/plain"] : [])];
  return {
    files: listOf(realFiles),
    items: listOf(items),
    types,
    getData: (type: string) => (type === "text/plain" || type === "text" ? (plain ?? "") : ""),
  };
}

export interface DragOptions {
  /** The items reported during the drag, before the drop. */
  items?: Array<{ kind: "file" | "string"; type: string }>;
  /** The files the drop delivers. */
  files?: File[];
}

/** A `dataTransfer` whose items say what a drag reports and whose files say what the drop gives. */
export function dataTransfer({ items, files = [] }: DragOptions) {
  const reported: Item[] = (items ?? files.map((f) => ({ kind: "file" as const, type: f.type }))).map((i) => ({
    kind: i.kind,
    type: i.type,
    getAsFile: () => null,
  }));
  return {
    items: listOf(reported),
    files: listOf(files),
    types: reported.some((i) => i.kind === "file") ? ["Files"] : ["text/plain"],
    dropEffect: "none",
    effectAllowed: "all",
    getData: () => "",
    setData: () => {},
  };
}

/** The bytes of whatever a request carried as its body. */
export async function bodyBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(body);
    });
  }
  throw new Error(`unreadable body ${Object.prototype.toString.call(body)}`);
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface Encoded {
  type: string | undefined;
  quality: number | undefined;
  width: number;
  height: number;
}

/**
 * Stands in for the browser's decoder and encoder. `createImageBitmap` answers
 * a bitmap of `size` or rejects, and both canvas encoders answer a JPEG of
 * `encodedBytes` bytes, recording the type, quality and canvas size asked.
 */
export function installCodec(opts: {
  size?: { width: number; height: number };
  decode?: "ok" | "fail" | "never";
  encodedBytes?: number;
} = {}) {
  const size = opts.size ?? { width: 8000, height: 6000 };
  const encoded: Encoded[] = [];
  const decoded: Blob[] = [];
  const encodedBlob = () => new Blob([new Uint8Array(opts.encodedBytes ?? 1234)], { type: "image/jpeg" });

  vi.stubGlobal(
    "createImageBitmap",
    vi.fn((source: Blob) => {
      decoded.push(source);
      if (opts.decode === "fail") return Promise.reject(new DOMException("cannot decode", "InvalidStateError"));
      if (opts.decode === "never") return new Promise(() => {});
      return Promise.resolve({ width: size.width, height: size.height, close: () => {} });
    }),
  );

  const context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    fillStyle: "#000",
  };

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: vi.fn(() => context),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    writable: true,
    value: vi.fn(function toBlob(this: HTMLCanvasElement, cb: (b: Blob | null) => void, type?: string, quality?: number) {
      encoded.push({ type, quality, width: this.width, height: this.height });
      cb(encodedBlob());
    }),
  });

  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return context;
    }
    convertToBlob(options: { type?: string; quality?: number } = {}) {
      encoded.push({ type: options.type, quality: options.quality, width: this.width, height: this.height });
      return Promise.resolve(encodedBlob());
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

  return { encoded, decoded, context };
}

export function answerMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
