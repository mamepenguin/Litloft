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

describe("SPEC-CORE-109 I5 / SPEC-CORE-192 /files/[id]?smart_collection= redirects to the drive root's queue", () => {
  it("redirects to /drive/{drive}?file={id}&queue=smart:{id} on the file's own drive", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "abc", drive: "main", folder_path: "movies" }),
    });
    await expect(
      FileRoute({
        params: Promise.resolve({ id: "abc" }),
        searchParams: Promise.resolve({ smart_collection: "7" }),
      }),
    ).rejects.toThrow(/__REDIRECT__/);
    const url = new URL(`http://localhost${mocks.redirect.mock.calls[0][0] as string}`);
    expect(url.pathname).toBe("/drive/main");
    expect(Object.fromEntries(url.searchParams)).toEqual({ file: "abc", queue: "smart:7" });
  });
});
