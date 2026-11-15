import { vi } from "vitest";

export interface WireCall {
  method: string;
  url: URL;
  body: unknown;
}

export type WireAnswer = (call: WireCall) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Stubs `fetch` with a router over method and URL, and records every call. The
 * request functions stay real, so whichever helper sends a request, the wire
 * shape is what is asserted.
 */
export function installWireFetch(answer: WireAnswer): { calls: WireCall[] } {
  const calls: WireCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : null;
      const url = new URL(req ? req.url : String(input), "http://localhost");
      const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
      const raw = init?.body ?? (req ? await req.clone().text() : undefined);
      const call: WireCall = { method, url, body: parseBody(raw) };
      calls.push(call);
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return answer(call);
    }),
  );
  return { calls };
}

export function never(): Promise<never> {
  return new Promise<never>(() => {});
}

/** Every value of `key` in the call's query string. */
export function paramsOf(call: WireCall, key: string): string[] {
  return call.url.searchParams.getAll(key);
}

export function fileIdsOf(call: WireCall): string[] | null {
  const body = call.body as { file_ids?: unknown } | null;
  return body && Array.isArray(body.file_ids) ? (body.file_ids as string[]) : null;
}

/** A listing endpoint answer paged by the request's own `page` and `limit`. */
export function pagedListing<T>(all: T[], call: WireCall): Response {
  const page = Number(call.url.searchParams.get("page") ?? "1");
  const limit = Number(call.url.searchParams.get("limit") ?? "30");
  return json({
    data: all.slice((page - 1) * limit, page * limit),
    meta: { total: all.length, page, limit },
  });
}
