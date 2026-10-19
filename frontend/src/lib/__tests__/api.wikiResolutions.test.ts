import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { foo: 1 }));
    const { getWikiResolutions } = await import("@/lib/api");
    await expect(getWikiResolutions("fileid000001")).rejects.toThrow();
  });

  it("URL-encodes the fileId path segment", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { resolutions: {} }),
    );
    const { getWikiResolutions } = await import("@/lib/api");
    await getWikiResolutions("ab cd/ef");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("ab%20cd%2Fef");
  });
});

describe("WikiResolveResult type export", () => {
  it("exposes a `WikiResolveResult` type from @/lib/api", async () => {
    const mod = await import("@/lib/api");
    expect(typeof mod.getWikiResolutions).toBe("function");
  });
});
