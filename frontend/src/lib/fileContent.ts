/**
 * Core-level helpers for reading and writing ``.md`` / ``.txt`` file
 * content via the Litloft Core API.
 *
 * The knowledge addon ships its own near-duplicate in
 * ``addons/knowledge/frontend/api.ts`` — this version lives in core so
 * it can back Properties Panel edits from the plain FilePreview
 * (non-knowledge surface) as part of the tag unification work
 * (spec ``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``
 * §D3). Keep the two implementations in sync if either side changes
 * its ETag contract or auth expectations.
 */

const API_BASE = "/api";

export interface LoadedTextFile {
  content: string;
  etag: string;
}

export class ConflictError extends Error {
  constructor() {
    super("ETag mismatch — file changed on the server");
    this.name = "ConflictError";
  }
}

function parseEtagHeader(res: Response): string {
  const raw = res.headers.get("etag");
  if (!raw) {
    throw new Error(
      "Server did not return an ETag; cannot perform optimistic updates."
    );
  }
  // Strip weak prefix and surrounding quotes so callers don't have to
  // normalise; PUT If-Match re-wraps in quotes below.
  return raw.replace(/^W\//, "").replace(/^"|"$/g, "");
}

// Cap the browser-side body read so a compromised upstream or a MITM
// with a multi-GB response can't exhaust memory before we bail. Core
// already enforces 10 MB on the content read endpoint; 16 MB gives
// headroom without letting anything pathological through.
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

/**
 * Fetch a text file's content + current ETag. Suitable for ``.md`` and
 * ``.txt``. Throws if the server advertises an oversized body via
 * ``Content-Length``. Binary streams (wrong MIME on disk) still decode
 * via ``res.text()`` — the caller is expected to validate on their end
 * if round-tripping matters.
 */
export async function getFileTextContent(
  fileId: string
): Promise<LoadedTextFile> {
  const res = await fetch(
    `${API_BASE}/files/${encodeURIComponent(fileId)}/stream`,
    { credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(`Failed to load file: ${res.status}`);
  }
  const declared = res.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_TEXT_BYTES) {
    throw new Error(
      `File too large for in-browser edit (${declared} bytes > ${MAX_TEXT_BYTES})`
    );
  }
  const content = await res.text();
  const etag = parseEtagHeader(res);
  return { content, etag };
}

/**
 * Write a text file's content with optimistic concurrency control.
 *
 * Returns the new ETag on success. Throws ``ConflictError`` on 412 so
 * callers can surface a "file changed elsewhere" warning without
 * overwriting. The ``ifMatch`` argument is wrapped in quotes before
 * being sent as ``If-Match``.
 */
export async function putFileTextContent(
  fileId: string,
  content: string,
  ifMatch: string
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/files/${encodeURIComponent(fileId)}/content`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "If-Match": `"${ifMatch}"`,
      },
      body: content,
    }
  );
  if (res.status === 412) {
    throw new ConflictError();
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => j?.detail)
      .catch(() => null);
    throw new Error(detail ?? `Failed to save file: ${res.status}`);
  }
  return parseEtagHeader(res);
}
