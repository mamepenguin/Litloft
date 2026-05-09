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

// Stub the FileDetailFullScreen so the playlist path can be exercised
// without pulling in the entire client-side tree.
vi.mock("@/components/FileDetailFullScreen", () => ({
  FileDetailFullScreen: ({ fileId }: { fileId: string }) => ({
    type: "div",
    props: { "data-testid": "fullscreen", children: `fs:${fileId}` },
  }),
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
  it("redirects to canonical URL when no playlist params are present", async () => {
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
    // useCreateFile (Topic 12) navigates to ``/files/{id}?edit=1`` to
    // open the new note in the editor. PR-5 made /files/{id} a
    // redirect, and the original CARRIED_QUERY_KEYS list dropped
    // ?edit; Pre-PR adds ``edit`` so the auto-edit-start signal
    // survives the canonical-URL trip.
    expect(url.searchParams.get("edit")).toBe("1");
  });

  it("carries ?t / ?page / ?highlight / ?sort / ?order through the redirect", async () => {
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
    expect(url.searchParams.get("highlight")).toBe("needle");
    expect(url.searchParams.get("sort")).toBe("name");
    expect(url.searchParams.get("order")).toBe("desc");
  });

  it("renders FileDetailFullScreen instead of redirecting when ?playlist= is set", async () => {
    const result = await FileRoute({
      params: Promise.resolve({ id: "abc" }),
      searchParams: Promise.resolve({ playlist: "pl1" }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      (result as { props: { fileId: string } }).props.fileId,
    ).toBe("abc");
  });

  it("renders FileDetailFullScreen when ?folder_play=1 is set", async () => {
    const result = await FileRoute({
      params: Promise.resolve({ id: "abc" }),
      searchParams: Promise.resolve({ folder_play: "1" }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(
      (result as { props: { fileId: string } }).props.fileId,
    ).toBe("abc");
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
