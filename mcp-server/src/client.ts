export interface LitloftClientConfig {
  baseUrl: string;
  token: string;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface LitloftRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  // For endpoints that need a header beyond Authorization, e.g. the addon
  // proxy's X-Lit-Drive (drive-scoped addon routes like intelligence's
  // semantic search).
  headers?: Record<string, string>;
}

export interface LitloftRawRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: string;
  headers?: Record<string, string>;
}

export interface LitloftRawResponse {
  status: number;
  headers: Headers;
  text: string;
}

export class LitloftApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Litloft API error: ${status}`);
    this.name = "LitloftApiError";
    this.status = status;
    this.body = body;
  }
}

export interface LitloftClient {
  request<T = unknown>(
    method: string,
    path: string,
    options?: LitloftRequestOptions
  ): Promise<T>;
  requestRaw(
    method: string,
    path: string,
    options?: LitloftRawRequestOptions
  ): Promise<LitloftRawResponse>;
  // For multipart/form-data endpoints (chunked upload). fetch sets its own
  // Content-Type with boundary for a FormData body, so this must not set
  // one manually the way request()/requestRaw() do for JSON/text.
  requestMultipart<T = unknown>(
    method: string,
    path: string,
    form: FormData
  ): Promise<T>;
}

async function finishJsonOrText<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("Content-Type") ?? "";
  const parsed = contentType.includes("application/json")
    ? await res.json().catch(() => undefined)
    : await res.text();

  if (!res.ok) {
    throw new LitloftApiError(res.status, parsed);
  }
  return parsed as T;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> | undefined
): URL {
  const url = new URL(baseUrl + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

// Every write goes through the same public /api/* surface the frontend
// uses (hako yOp7JPjCTJVe_Ui5rWrEV): this client is intentionally a thin
// fetch wrapper with no Litloft-specific business logic, so the backend's
// existing validation/access-control stays the single source of truth.
// A hung/unresponsive backend must not block a tool call forever — mirrors
// the AbortSignal.timeout pattern the project's own SSR fetches use
// (backend PR fixing page.tsx SSR hangs).
export function createLitloftClient(config: LitloftClientConfig): LitloftClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async request<T>(
      method: string,
      path: string,
      options: LitloftRequestOptions = {}
    ): Promise<T> {
      const url = buildUrl(baseUrl, path, options.query);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.token}`,
        ...options.headers,
      };
      let body: string | undefined;
      if (options.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.json);
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      return finishJsonOrText<T>(res);
    },

    // For endpoints whose response headers carry meaning (the ETag on
    // /files/{id}/stream and /files/{id}/content) or whose request body is
    // raw text rather than JSON (PUT .../content). Kept separate from
    // request() rather than overloading it, since mixing "always-JSON" and
    // "sometimes-raw-text-with-headers" in one generic return type gets
    // muddy fast.
    async requestRaw(
      method: string,
      path: string,
      options: LitloftRawRequestOptions = {}
    ): Promise<LitloftRawResponse> {
      const url = buildUrl(baseUrl, path, options.query);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.token}`,
        ...options.headers,
      };

      const res = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();

      if (!res.ok) {
        const contentType = res.headers.get("Content-Type") ?? "";
        let parsedBody: unknown = text;
        if (contentType.includes("application/json")) {
          try {
            parsedBody = JSON.parse(text);
          } catch {
            // fall through with raw text
          }
        }
        throw new LitloftApiError(res.status, parsedBody);
      }

      return { status: res.status, headers: res.headers, text };
    },

    async requestMultipart<T>(
      method: string,
      path: string,
      form: FormData
    ): Promise<T> {
      const url = buildUrl(baseUrl, path, undefined);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.token}`,
      };

      const res = await fetch(url, {
        method,
        headers,
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });

      return finishJsonOrText<T>(res);
    },
  };
}
