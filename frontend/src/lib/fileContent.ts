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

/**
 * Fetch a text file's content + current ETag. Suitable for ``.md`` and
 * ``.txt``; binary streams are rejected at the server (wrong MIME →
 * ``fetchText`` will still return bytes which the caller should handle).
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
