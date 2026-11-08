/** SPEC-CORE-056 client: getShelves calls the shelves endpoint with the listing's encoding. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { getShelves } from "../api";

const fetchMock = vi.fn();

const body = { by: "folder", shelves: [], total_shelves: 0 };

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function requested(): URL {
  return new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
}

describe("SPEC-CORE-056 getShelves", () => {
  it("SPEC-CORE-056 calls GET /api/drives/{drive}/shelves with the drive encoded", async () => {
    await getShelves("my drive", { by: "folder" } as never);

    expect(requested().pathname).toBe(`/api/drives/${encodeURIComponent("my drive")}/shelves`);
    expect(requested().searchParams.get("by")).toBe("folder");
  });

  it("SPEC-CORE-056 returns the parsed ShelvesResponse", async () => {
    await expect(getShelves("main", { by: "folder" } as never)).resolves.toEqual(body);
  });

  it("SPEC-CORE-056 repeats array parameters the way the listing does", async () => {
    await getShelves("main", {
      by: "tag",
      type: ["video"],
      tag: ["a", "b"],
      folder: ["x"],
      duration: ["lt:600"],
    } as never);

    const q = requested().searchParams;
    expect(q.getAll("type")).toEqual(["video"]);
    expect(q.getAll("tag")).toEqual(["a", "b"]);
    expect(q.getAll("folder")).toEqual(["x"]);
    expect(q.getAll("duration")).toEqual(["lt:600"]);
  });

  it("SPEC-CORE-056 sends key, sort, order and the paging parameters", async () => {
    await getShelves("main", {
      by: "watch",
      key: "in_progress",
      sort: "last_played",
      order: "desc",
      per_shelf: 12,
      shelf_limit: 12,
      offset: 24,
      page: 2,
    } as never);

    const q = requested().searchParams;
    expect(Object.fromEntries(q.entries())).toMatchObject({
      by: "watch",
      key: "in_progress",
      sort: "last_played",
      order: "desc",
      per_shelf: "12",
      shelf_limit: "12",
      offset: "24",
      page: "2",
    });
  });

  it("SPEC-CORE-056 keeps an empty key, which is the root folder shelf", async () => {
    await getShelves("main", { by: "folder", key: "" } as never);

    expect(requested().searchParams.has("key")).toBe(true);
    expect(requested().searchParams.get("key")).toBe("");
  });

  it("sends by=all without a key as the whole-list shelf", async () => {
    await getShelves("main", { by: "all", per_shelf: 1 } as never);

    const q = requested().searchParams;
    expect(q.get("by")).toBe("all");
    expect(q.has("key")).toBe(false);
    expect(q.get("per_shelf")).toBe("1");
  });

  it("sends the watch filter", async () => {
    await getShelves("main", { by: "all", watch: "finished" } as never);

    expect(requested().searchParams.get("watch")).toBe("finished");
  });

  it("returns the folder base of the response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ...body, by: "folder", base: "Books" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(getShelves("main", { by: "folder" } as never)).resolves.toMatchObject({
      base: "Books",
    });
  });

  it("SPEC-CORE-056 rejects when the server answers an error status", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(getShelves("main", { by: "folder" } as never)).rejects.toThrow();
  });
});
