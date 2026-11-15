/**
 * SPEC-CORE-111 step 4 / I7: a failed drive listing throws ApiStatusError
 * carrying the HTTP status, with the message the browser showed before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles } from "../api";
import { ApiStatusError } from "../apiError";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-111 I7 getDriveFiles on a non-2xx answer", () => {
  it.each([
    [404, "Not Found"],
    [500, "Internal Server Error"],
    [401, "Unauthorized"],
  ])("throws ApiStatusError(%i) with the message 'API error: <status> <statusText>'", async (status, statusText) => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "x" }), {
        status,
        statusText,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const error = await getDriveFiles("main", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiStatusError);
    expect((error as ApiStatusError).status).toBe(status);
    expect((error as ApiStatusError).message).toBe(`API error: ${status} ${statusText}`);
  });
});
