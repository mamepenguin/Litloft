import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Safari before 17 has no `URLSearchParams.prototype.size`. */
class SizelessSearchParams extends URLSearchParams {
  get size(): number {
    return undefined as unknown as number;
  }
}

describe("tag and folder-count requests", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URLSearchParams", SizelessSearchParams);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

  it("sends the folder scope and the kind, or nothing, whatever the browser's URLSearchParams offers", async () => {
    const { getDriveTags, getFolderCounts } = await import("@/lib/api");
    await getDriveTags("動画 1");
    await getDriveTags("d", "旅行/京都");
    await getDriveTags("d", null, "text");
    await getDriveTags("d", "Inbox", "text");
    await getDriveTags("d", null, "text", "Inbox/Deep");
    await getDriveTags("d", null, "text", "");
    await getDriveTags("d", null, "text", null);
    await getFolderCounts("d");
    await getFolderCounts("d", "text");

    expect(urls()).toEqual([
      "/api/drives/%E5%8B%95%E7%94%BB%201/tags",
      "/api/drives/d/tags?folder_path=%E6%97%85%E8%A1%8C%2F%E4%BA%AC%E9%83%BD",
      "/api/drives/d/tags?type=text",
      "/api/drives/d/tags?folder_path=Inbox&type=text",
      "/api/drives/d/tags?path=Inbox%2FDeep&type=text",
      "/api/drives/d/tags?path=&type=text",
      "/api/drives/d/tags?type=text",
      "/api/drives/d/folder-counts",
      "/api/drives/d/folder-counts?type=text",
    ]);
  });
});
