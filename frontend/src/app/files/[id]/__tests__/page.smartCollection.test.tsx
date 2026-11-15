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

describe("SPEC-CORE-109 I5 /files/[id] renders the player for ?smart_collection=", () => {
  it("renders FileDetailFullScreen without the canonical redirect", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "abc", drive: "main", folder_path: "movies" }),
    });
    const result = await FileRoute({
      params: Promise.resolve({ id: "abc" }),
      searchParams: Promise.resolve({ smart_collection: "7" }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((result as { props: { fileId: string } }).props.fileId).toBe("abc");
  });
});
