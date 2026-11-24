/**
 * SPEC-CORE-114: the browser's visibility list for the drive on screen.
 * Section 3 (loading / loaded), I2 (per drive), I10 (no list across a drive switch).
 * Driven through `fetch`, so the test does not depend on how the hook calls it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useEntryVisibility } from "@/hooks/useEntryVisibility";

const A = "alpha";
const B = "beta";

type Answer = (drive: string) => Promise<Response>;
const never = () => new Promise<Response>(() => {});
let answer: Answer = never;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The drive named in a visibility URL, or null for any other request. */
function driveOf(url: string): string | null {
  const m = /\/drives\/([^/]+)\/entry-visibility/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

beforeEach(() => {
  answer = never;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const drive = driveOf(url);
      return drive === null ? Promise.reject(new TypeError("unmocked request")) : answer(drive);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-114 useEntryVisibility", () => {
  it("SPEC-CORE-114 Section 3 I1: reports loading (null) until the drive's list arrives", () => {
    const { result } = renderHook(() => useEntryVisibility(A));
    expect(result.current.hidden).toBeNull();
  });

  it("SPEC-CORE-114 Section 1 I2: returns the keys the drive lists", async () => {
    answer = async () => json({ hidden: ["video"] });
    const { result } = renderHook(() => useEntryVisibility(A));
    await waitFor(() => expect(result.current.hidden).not.toBeNull());
    expect(result.current.hidden!.has("video")).toBe(true);
    expect(result.current.hidden!.has("reading")).toBe(false);
    expect(result.current.hidden!.size).toBe(1);
  });

  it("SPEC-CORE-114 Section 2 I1: a loaded empty list is a set that hides nothing", async () => {
    answer = async () => json({ hidden: [] });
    const { result } = renderHook(() => useEntryVisibility(A));
    await waitFor(() => expect(result.current.hidden).not.toBeNull());
    expect(result.current.hidden!.size).toBe(0);
  });

  it("SPEC-CORE-114 Section 2 I9: a failed request is a loaded set that hides nothing, not null", async () => {
    answer = async () => {
      throw new TypeError("network down");
    };
    const { result } = renderHook(() => useEntryVisibility(A));
    await waitFor(() => expect(result.current.hidden).not.toBeNull());
    expect(result.current.hidden!.size).toBe(0);
  });

  it("SPEC-CORE-114 Section 2 I9: a 500 answer is a loaded set that hides nothing, not null", async () => {
    answer = async () => json({ detail: "Configuration error" }, 500);
    const { result } = renderHook(() => useEntryVisibility(A));
    await waitFor(() => expect(result.current.hidden).not.toBeNull());
    expect(result.current.hidden!.size).toBe(0);
  });

  it("SPEC-CORE-114 I2: a list for one drive does not reach another drive", async () => {
    answer = async (drive) => json({ hidden: drive === A ? ["video"] : [] });
    const { result, rerender } = renderHook(({ drive }) => useEntryVisibility(drive), {
      initialProps: { drive: A },
    });
    await waitFor(() => expect(result.current.hidden?.has("video")).toBe(true));

    rerender({ drive: B });
    await waitFor(() => expect(result.current.hidden).not.toBeNull());
    expect(result.current.hidden!.has("video")).toBe(false);
  });

  it("SPEC-CORE-114 I10: after a drive switch, the previous drive's list is not returned while the new one is pending", async () => {
    answer = async (drive) => (drive === A ? json({ hidden: ["video"] }) : never());
    const { result, rerender } = renderHook(({ drive }) => useEntryVisibility(drive), {
      initialProps: { drive: A },
    });
    await waitFor(() => expect(result.current.hidden?.has("video")).toBe(true));

    rerender({ drive: B });
    expect(result.current.hidden).toBeNull();
  });
});
