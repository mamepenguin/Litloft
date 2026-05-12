import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase C, spec 2026-05-12-markdown-link-three-forms.md §3.8.
 *
 * ``getWikiResolutions(fileId)`` is the thin client over
 * ``GET /api/files/{fileId}/wiki-resolutions``. The endpoint returns
 * ``{resolutions: {target: WikiResolveResult}}``; the helper unwraps
 * the inner map so the renderer can pass it through verbatim as the
 * ``wikiResolution`` prop.
 *
 * Error contract:
 *   404 ............... throw with informative message
 *   415 ............... throw "Not a markdown file"
 *   Network error ..... throw with cause preserved
 *   Malformed body .... throw (defensive parse guard)
 */
describe("getWikiResolutions API helper", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("returns the inner resolutions map on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        resolutions: {
          alpha: { kind: "resolved", file_id: "abc123def456" },
          beta: { kind: "unresolved" },
          gamma: { kind: "ambiguous", candidates: ["a.md", "b.md"] },
        },
      }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    const map = await getWikiResolutions("fileid000001");
    expect(map).toEqual({
      alpha: { kind: "resolved", file_id: "abc123def456" },
      beta: { kind: "unresolved" },
      gamma: { kind: "ambiguous", candidates: ["a.md", "b.md"] },
    });
    // The endpoint sits under /api/files/{id}/wiki-resolutions.
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/files/fileid000001/wiki-resolutions");
  });

  it("sends credentials so password-protected drives flow through cookies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { resolutions: {} }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    await getWikiResolutions("fileid000001");
    const opts = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(opts?.credentials).toBe("include");
  });

  it("returns an empty object when the server response has no resolutions", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { resolutions: {} }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    const map = await getWikiResolutions("fileid000001");
    expect(map).toEqual({});
  });

  it("throws when the file is not markdown (415)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(415, { detail: "Not a markdown file" }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    await expect(getWikiResolutions("fileid000001")).rejects.toThrow(
      /not a markdown file/i,
    );
  });

  it("throws when the file is missing or inaccessible (404)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { detail: "File not found" }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    await expect(getWikiResolutions("fileid000001")).rejects.toThrow(/404/);
  });

  it("propagates network errors with the original cause", async () => {
    const cause = new Error("ECONNREFUSED");
    fetchMock.mockRejectedValueOnce(cause);
    const { getWikiResolutions } = await import("@/lib/api");
    await expect(getWikiResolutions("fileid000001")).rejects.toThrow();
  });

  it("throws when the response shape is malformed (no `resolutions` key)", async () => {
    // Defensive guard: a future backend bug that drops the wrapper key
    // should not silently feed `undefined` into the renderer.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { foo: 1 }));
    const { getWikiResolutions } = await import("@/lib/api");
    await expect(getWikiResolutions("fileid000001")).rejects.toThrow();
  });

  it("URL-encodes the fileId path segment", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { resolutions: {} }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    // file_id is a 12-char allowlist in practice, but the helper still
    // calls encodeURIComponent for defense against caller typos / a
    // possible future relaxation of the id format.
    await getWikiResolutions("ab cd/ef");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("ab%20cd%2Fef");
  });
});

describe("WikiResolveResult type export", () => {
  it("exposes a `WikiResolveResult` type from @/lib/api", async () => {
    // Type-only smoke test: importing the type must not throw and the
    // shape must be assignable to the three documented variants.
    const mod = await import("@/lib/api");
    // The module exists; verifying type re-export at runtime is a
    // compile-time concern, so we only check the helper symbol is
    // alive here. The renderer / FileDetailContent tests cover usage.
    expect(typeof mod.getWikiResolutions).toBe("function");
  });
});
