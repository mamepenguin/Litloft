export type FindKind =
  | "utterance"
  | "scene"
  | "page"
  | "section"
  | "picture_text"
  | "text";

export interface FindRow {
  kind: FindKind;
  start?: number | null;
  end?: number | null;
  page?: number | null;
  section?: number | null;
  section_title?: string | null;
  ordinal: number;
  snippet: string;
  match_start: number;
  match_length: number;
}

export interface FindAnswer {
  query: string;
  indexed: boolean;
  total: number;
  truncated: boolean;
  rows: FindRow[];
}

export type FindResult =
  | { kind: "answer"; answer: FindAnswer }
  | { kind: "unavailable" }
  | { kind: "failed" }
  | { kind: "aborted" };

const API_BASE = "/api";

function driveHeaders(drive: string): HeadersInit {
  return { "X-Lit-Drive": encodeURIComponent(drive) };
}

function readAnswer(data: unknown): FindAnswer | null {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  if (typeof body.indexed !== "boolean") return null;
  if (typeof body.total !== "number" || !Number.isFinite(body.total)) return null;
  if (typeof body.truncated !== "boolean") return null;
  if (!Array.isArray(body.rows)) return null;
  return {
    query: typeof body.query === "string" ? body.query : "",
    indexed: body.indexed,
    total: body.total,
    truncated: body.truncated,
    rows: body.rows as FindRow[],
  };
}

export async function fetchFileFind(
  fileId: string,
  query: string,
  drive: string,
  signal?: AbortSignal,
): Promise<FindResult> {
  const params = new URLSearchParams({ q: query });
  try {
    const res = await fetch(
      `${API_BASE}/addons/intelligence/files/${encodeURIComponent(fileId)}/find?${params.toString()}`,
      {
        credentials: "include",
        headers: driveHeaders(drive),
        signal,
      },
    );
    if (res.status === 403 || res.status === 404) return { kind: "unavailable" };
    if (!res.ok) return { kind: "failed" };
    const answer = readAnswer(await res.json());
    if (!answer) return { kind: "failed" };
    return { kind: "answer", answer };
  } catch (error) {
    if (signal?.aborted) return { kind: "aborted" };
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "aborted" };
    }
    return { kind: "failed" };
  }
}
