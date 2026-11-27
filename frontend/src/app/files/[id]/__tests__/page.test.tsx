/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("__NOT_FOUND__");
  }),
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));

const fetchSpy = vi.fn();
const originalFetch = globalThis.fetch;

import FileRoute from "../page";

beforeEach(() => {
  mocks.redirect.mockClear();
  mocks.notFound.mockClear();
  fetchSpy.mockReset();
  mocks.cookies.mockResolvedValue({
    get: () => undefined,
  });
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("/files/[id] Server Component", () => {
  it("redirects to canonical URL when no collection params are present", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "abc",
        drive: "main",
        folder_path: "movies/2026",
      }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "abc" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__REDIRECT__/);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/drive/main/movies/2026?file=abc",
    );
  });

  it("encodes drive name and folder segments in the redirect target", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "x1",
        drive: "my drive",
        folder_path: "a b/c d",
      }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "x1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__REDIRECT__/);

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/drive/my%20drive/a%20b/c%20d?file=x1",
    );
  });

  it("carries ?edit through the redirect (Phase 2 Pre-PR: Knowledge editor auto-start)", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "abc",
        drive: "main",
        folder_path: "Notes",
      }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "abc" }),
        searchParams: Promise.resolve({ edit: "1" }),
      }),
    ).rejects.toThrow(/__REDIRECT__/);

    const target = mocks.redirect.mock.calls[0][0] as string;
    const url = new URL(`http://localhost${target}`);
    expect(url.searchParams.get("file")).toBe("abc");
    expect(url.searchParams.get("edit")).toBe("1");
  });

  it("carries ?t / ?page / ?section / ?highlight / ?sort / ?order through the redirect", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "abc",
        drive: "main",
        folder_path: "",
      }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "abc" }),
        searchParams: Promise.resolve({
          t: "10",
          page: "5",
          section: "3",
          highlight: "needle",
          sort: "name",
          order: "desc",
        }),
      }),
    ).rejects.toThrow(/__REDIRECT__/);

    const target = mocks.redirect.mock.calls[0][0] as string;
    expect(target).toMatch(/^\/drive\/main\?/);
    const url = new URL(`http://localhost${target}`);
    expect(url.searchParams.get("file")).toBe("abc");
    expect(url.searchParams.get("t")).toBe("10");
    expect(url.searchParams.get("page")).toBe("5");
    expect(url.searchParams.get("section")).toBe("3");
    expect(url.searchParams.get("highlight")).toBe("needle");
    expect(url.searchParams.get("sort")).toBe("name");
    expect(url.searchParams.get("order")).toBe("desc");
  });

  it("calls notFound() when backend returns 404", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "not found" }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__NOT_FOUND__/);
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("forwards the access_token cookie to the backend", async () => {
    mocks.cookies.mockResolvedValue({
      get: (key: string) =>
        key === "access_token" ? { value: "tok123" } : undefined,
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "abc",
        drive: "main",
        folder_path: "",
      }),
    });

    await expect(
      FileRoute({
        params: Promise.resolve({ id: "abc" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__REDIRECT__/);

    const [, options] = fetchSpy.mock.calls[0];
    expect((options as { headers: { Cookie?: string } }).headers.Cookie).toBe(
      "access_token=tok123",
    );
  });
});

const KEPT = { t: "10", page: "5", section: "3", highlight: "needle", find: "word", edit: "1" };

async function redirectOf(fileId: string, query: Record<string, string>, file = { drive: "main", folder_path: "movies/2026" }) {
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: fileId, ...file }) });
  await expect(
    FileRoute({ params: Promise.resolve({ id: fileId }), searchParams: Promise.resolve(query) }),
  ).rejects.toThrow(/__REDIRECT__/);
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
  const target = mocks.redirect.mock.calls[0][0] as string;
  const url = new URL(`http://localhost${target}`);
  return { pathname: url.pathname, params: url.searchParams, target };
}

describe("SPEC-CORE-192 I6 legacy queue URLs redirect to the two-pane pages", () => {
  it.each([
    ["?collection=", { collection: "c1" }, "/drive/main/collections/c1", { file: "abc" }],
    ["?playlist=", { playlist: "c1" }, "/drive/main/collections/c1", { file: "abc" }],
    ["?smart_collection=", { smart_collection: "7" }, "/drive/main", { file: "abc", queue: "smart:7" }],
    ["?folder_play=1", { folder_play: "1" }, "/drive/main/movies/2026", { file: "abc", queue: "folder" }],
    ["?collection= over ?playlist=", { playlist: "p9", collection: "c1" }, "/drive/main/collections/c1", { file: "abc" }],
    ["?collection= over ?smart_collection= and ?folder_play=1", { folder_play: "1", smart_collection: "7", collection: "c1" }, "/drive/main/collections/c1", { file: "abc" }],
    ["?playlist= over ?smart_collection=", { smart_collection: "7", playlist: "p9" }, "/drive/main/collections/p9", { file: "abc" }],
    ["?smart_collection= over ?folder_play=1", { folder_play: "1", smart_collection: "7" }, "/drive/main", { file: "abc", queue: "smart:7" }],
  ] as const)("%s", async (_label, query, pathname, expected) => {
    const got = await redirectOf("abc", { ...query });
    expect(got.pathname).toBe(pathname);
    expect(Object.fromEntries(got.params)).toEqual(expected);
  });

  it.each([
    ["?collection=", { collection: "c1" }],
    ["?playlist=", { playlist: "c1" }],
    ["?smart_collection=", { smart_collection: "7" }],
    ["?folder_play=1", { folder_play: "1" }],
  ] as const)("%s keeps t, page, section, highlight, find and edit, and drops nav", async (_label, query) => {
    const got = await redirectOf("abc", { ...query, ...KEPT, nav: "inbox" });
    for (const [k, v] of Object.entries(KEPT)) expect(got.params.get(k)).toBe(v);
    expect(got.params.has("nav")).toBe(false);
    expect(got.params.get("file")).toBe("abc");
  });

  it("keeps sort and order only on the folder form", async () => {
    const folder = await redirectOf("abc", { folder_play: "1", sort: "title", order: "asc" });
    expect(folder.params.get("sort")).toBe("title");
    expect(folder.params.get("order")).toBe("asc");
    mocks.redirect.mockClear();

    const others: Record<string, string>[] = [{ collection: "c1" }, { playlist: "c1" }, { smart_collection: "7" }];
    for (const query of others) {
      const other = await redirectOf("abc", { ...query, sort: "title", order: "asc" });
      expect(other.params.has("sort")).toBe(false);
      expect(other.params.has("order")).toBe(false);
      mocks.redirect.mockClear();
    }
  });

  it("uses the file's own drive and folder, encoded, and the root folder as the drive", async () => {
    const nested = await redirectOf("x1", { folder_play: "1" }, { drive: "my drive", folder_path: "a b/c d" });
    expect(nested.target.startsWith("/drive/my%20drive/a%20b/c%20d?")).toBe(true);
    expect(nested.params.get("queue")).toBe("folder");
    mocks.redirect.mockClear();

    const root = await redirectOf("x1", { folder_play: "1" }, { drive: "main", folder_path: "" });
    expect(root.pathname).toBe("/drive/main");
    expect(root.params.get("queue")).toBe("folder");
    mocks.redirect.mockClear();

    const collection = await redirectOf("x1", { collection: "c1" }, { drive: "my drive", folder_path: "a" });
    expect(collection.target.startsWith("/drive/my%20drive/collections/c1?")).toBe(true);
  });

  it.each([
    ["?collection=", { collection: "c1" }],
    ["?smart_collection=", { smart_collection: "7" }],
    ["?folder_play=1", { folder_play: "1" }],
  ] as const)("answers 404 for %s when the file does not exist or is locked", async (_label, query) => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "not found" }) });
    await expect(
      FileRoute({ params: Promise.resolve({ id: "missing" }), searchParams: Promise.resolve({ ...query }) }),
    ).rejects.toThrow(/__NOT_FOUND__/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
