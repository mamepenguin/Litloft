import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { batchGetFiles, getDriveFiles, getFileShared, getMissing, getTrash } from "@/lib/api";
import { _resetFileSeedForTests, peekFileSeed } from "@/lib/fileSeed";

const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
  _resetFileSeedForTests();
});

describe("list fetchers seed the file detail", () => {
  it("getDriveFiles seeds every item it returns", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "a" }, { id: "b" }], meta: { total: 2, page: 1, limit: 50 } }),
    );
    await getDriveFiles("d", {});
    expect(peekFileSeed("a")?.id).toBe("a");
    expect(peekFileSeed("b")?.id).toBe("b");
  });

  it("batchGetFiles seeds every item it returns", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ id: "c" }]));
    await batchGetFiles(["c"]);
    expect(peekFileSeed("c")?.id).toBe("c");
  });

  it("trash and missing listings do not seed", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "t" }], meta: { total: 1, page: 1, limit: 50 } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "m" }], meta: { total: 1, page: 1, limit: 50 } }));
    await getTrash("d");
    await getMissing("d");
    expect(peekFileSeed("t")).toBeNull();
    expect(peekFileSeed("m")).toBeNull();
  });
});

describe("getFileShared", () => {
  it("callers that ask while a request is in flight share it", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a", title: "x" }));
    const [first, second] = await Promise.all([
      getFileShared("a"),
      getFileShared("a"),
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("asks the server again once the previous answer has arrived", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "a", title: "old" }))
      .mockResolvedValueOnce(jsonResponse({ id: "a", title: "new" }));
    await getFileShared("a");
    const again = await getFileShared("a");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(again.title).toBe("new");
  });

  it("a failed request is not shared with the next caller", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ id: "a" }));
    await expect(getFileShared("a")).rejects.toThrow();
    await expect(getFileShared("a")).resolves.toMatchObject({ id: "a" });
  });

  it("the answer replaces the seed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a", title: "fresh" }));
    await getFileShared("a");
    expect(peekFileSeed("a")?.title).toBe("fresh");
  });
});
