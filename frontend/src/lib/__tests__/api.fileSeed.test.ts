import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchGetFiles,
  getCollection,
  getDriveFiles,
  getDuplicates,
  getFileShared,
  getMissing,
  getTrash,
  getWatchHistory,
} from "@/lib/api";
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
  const page = (ids: string[]) => ({
    data: ids.map((id) => ({ id })),
    meta: { total: ids.length, page: 1, limit: 50 },
  });

  it.each([
    ["getDriveFiles", () => getDriveFiles("d", {}), page(["a", "b"])],
    ["batchGetFiles", () => batchGetFiles(["a", "b"]), [{ id: "a" }, { id: "b" }]],
    [
      "getWatchHistory",
      () => getWatchHistory("d"),
      { data: [{ id: "a" }, { id: "b" }] },
    ],
    [
      "getCollection",
      () => getCollection("d", "c1"),
      {
        id: "c1",
        items: [
          { id: 1, position: 0, file: { id: "a" } },
          { id: 2, position: 1, file: { id: "b" } },
        ],
      },
    ],
    [
      "getDuplicates",
      () => getDuplicates("d"),
      { groups: [{ hash: "h", total_size: 0, files: [{ id: "a" }, { id: "b" }] }] },
    ],
  ] as const)("%s seeds every file it returns", async (_name, call, body) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(body));
    await call();
    expect(peekFileSeed("a")?.id).toBe("a");
    expect(peekFileSeed("b")?.id).toBe("b");
  });

  it.each([
    ["getTrash", () => getTrash("d")],
    ["getMissing", () => getMissing("d")],
  ] as const)("%s does not seed", async (_name, call) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(page(["t"])));
    await call();
    expect(peekFileSeed("t")).toBeNull();
  });

  it("a trashed or missing file in a seeding list is not seeded", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "c1",
        items: [
          { id: 1, position: 0, file: { id: "gone", deleted_at: "2026-01-01T00:00:00Z" } },
          { id: 2, position: 1, file: { id: "lost", missing_since: "2026-01-01T00:00:00Z" } },
          { id: 3, position: 2, file: { id: "here", deleted_at: null, missing_since: null } },
        ],
      }),
    );
    await getCollection("d", "c1");
    expect(peekFileSeed("gone")).toBeNull();
    expect(peekFileSeed("lost")).toBeNull();
    expect(peekFileSeed("here")?.id).toBe("here");
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
