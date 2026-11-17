/**
 * SPEC-CORE-125 section 7: a failed drive summary throws ApiStatusError carrying the status,
 * with the message the browser showed before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDriveSummary } from "../api";
import { ApiStatusError } from "../apiError";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-125 getDriveSummary", () => {
  it.each([
    [404, "Not Found"],
    [500, "Internal Server Error"],
    [401, "Unauthorized"],
  ])("throws ApiStatusError(%i) with 'API error: <status> <statusText>'", async (status, statusText) => {
    mockFetch.mockResolvedValueOnce(
      new Response("{}", { status, statusText, headers: { "Content-Type": "application/json" } }),
    );
    const error = await getDriveSummary("my work").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiStatusError);
    expect((error as ApiStatusError).status).toBe(status);
    expect((error as ApiStatusError).message).toBe(`API error: ${status} ${statusText}`);
    expect(String(mockFetch.mock.calls[0][0])).toBe("/api/drives/my%20work/summary");
  });

  it("returns the summary on a 2xx", async () => {
    const body = { name: "work", trash_count: 2, missing_count: 1 };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await expect(getDriveSummary("work")).resolves.toEqual(body);
  });
});
