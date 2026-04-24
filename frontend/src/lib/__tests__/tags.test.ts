import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, createDebouncedTagSaver, saveFileTags } from "@/lib/tags";

function mdFile(overrides: Partial<{ id: string; mime: string; name: string }> = {}) {
  return {
    id: overrides.id ?? "fMd000000001",
    mime_type: overrides.mime ?? "text/markdown",
    filename: overrides.name ?? "note.md",
  };
}

function videoFile() {
  return { id: "fVid00000001", mime_type: "video/mp4", filename: "movie.mp4" };
}

function textResponse(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { etag: '"abc"', ...headers } });
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("saveFileTags dispatcher", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("non-.md files PUT /api/files/{id}/tags directly", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ id: "fVid00000001", tags: ["keep"] })
    );
    await saveFileTags(videoFile(), ["keep"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/files/fVid00000001/tags");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ tags: ["keep"] });
  });

  it(".md files round-trip content → rewrite frontmatter → PUT content", async () => {
    // Since Phase 11, core projects frontmatter tags in the content
    // PUT handler. Frontend flow is exactly two requests: fetch + PUT.
    fetchSpy
      // 1. getFileTextContent
      .mockResolvedValueOnce(textResponse("---\ntags: [old]\n---\nbody\n"))
      // 2. putFileTextContent
      .mockResolvedValueOnce(new Response("", { status: 200, headers: { etag: '"new"' } }));

    await saveFileTags(mdFile(), ["new1", "new2"]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, putInit] = fetchSpy.mock.calls[1];
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["If-Match"]).toBe('"abc"');
    const body = putInit.body as string;
    expect(body).toContain("tags:");
    expect(body).toContain("new1");
    expect(body).toContain("new2");
    expect(body).not.toContain("old");
  });

  it(".md: does not call the knowledge resync endpoint", async () => {
    // Guard rail — a regression that re-introduces the resync call
    // would re-couple core to the knowledge addon and break .md tag
    // saves on knowledge-less deployments.
    fetchSpy
      .mockResolvedValueOnce(textResponse("---\ntags: [old]\n---\nbody\n"))
      .mockResolvedValueOnce(new Response("", { status: 200, headers: { etag: '"new"' } }));

    await saveFileTags(mdFile(), ["new"]);

    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("resync-tags"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/addons/knowledge/"))).toBe(false);
  });

  it(".md: no-op when the new frontmatter matches current content", async () => {
    fetchSpy.mockResolvedValueOnce(
      textResponse("---\ntags: [a, b]\n---\nbody\n")
    );
    // No PUT — saveFileTags detects the body would be unchanged.
    await saveFileTags(mdFile(), ["a", "b"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it(".md: 412 ETag collision surfaces as ConflictError", async () => {
    fetchSpy
      .mockResolvedValueOnce(textResponse("---\ntags: [a]\n---\nbody\n"))
      .mockResolvedValueOnce(new Response("", { status: 412 }));

    await expect(saveFileTags(mdFile(), ["changed"])).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it(".md dispatch falls back to filename ext when mime is text/plain", async () => {
    fetchSpy
      .mockResolvedValueOnce(textResponse("body\n"))
      .mockResolvedValueOnce(
        new Response("", { status: 200, headers: { etag: '"new"' } })
      );
    await saveFileTags(
      mdFile({ mime: "text/plain", name: "note.md" }),
      ["ok"]
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain("/stream");
  });
});

describe("createDebouncedTagSaver", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("coalesces rapid calls into a single save", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    const saver = createDebouncedTagSaver(videoFile(), { delayMs: 100 });

    saver.schedule(["a"]);
    saver.schedule(["a", "b"]);
    saver.schedule(["a", "b", "c"]);
    expect(fetchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      tags: ["a", "b", "c"],
    });
  });

  it("flush() fires immediately and awaits completion", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    const saver = createDebouncedTagSaver(videoFile(), { delayMs: 10000 });
    saver.schedule(["x"]);
    await saver.flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops a pending save", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    const saver = createDebouncedTagSaver(videoFile(), { delayMs: 100 });
    saver.schedule(["x"]);
    saver.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("onSaveSuccess fires once per debounced save, AFTER the request lands", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    const onSuccess = vi.fn();
    const saver = createDebouncedTagSaver(videoFile(), {
      delayMs: 10,
      onSaveSuccess: onSuccess,
    });
    saver.schedule(["a"]);
    saver.schedule(["a", "b"]);
    saver.schedule(["a", "b", "c"]);
    // Not fired pre-save
    expect(onSuccess).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await saver.flush();
    // Coalesces to exactly one call with the final tag list
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("onSaveSuccess does NOT fire when the save fails", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const saver = createDebouncedTagSaver(videoFile(), {
      delayMs: 10,
      onSaveSuccess: onSuccess,
      onError,
    });
    saver.schedule(["x"]);
    await vi.advanceTimersByTimeAsync(10);
    await saver.flush();
    expect(onError).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("onError receives failures", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("", { status: 500 })
    );
    const errors: Error[] = [];
    const saver = createDebouncedTagSaver(videoFile(), {
      delayMs: 10,
      onError: (e) => errors.push(e),
    });
    saver.schedule(["x"]);
    await vi.advanceTimersByTimeAsync(10);
    await saver.flush();
    expect(errors).toHaveLength(1);
  });
});
