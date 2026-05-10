/**
 * Tests for `usePolicy(drive, addon, feature)` — the frontend mirror of the
 * backend `is_addon_feature_enabled` helper.
 *
 * Spec: docs/superpowers/specs/2026-05-10-markdown-document-layout.md § 4 D4.
 *
 * Contract:
 *   - Fetches GET /api/drives/{drive}/addon-policies on first mount per drive
 *   - Returns { enabled: boolean, isLoading: boolean }
 *   - Reads addons[addon].features[feature] when present
 *   - Falls back to addons[addon].default when the feature is not listed
 *   - Falls back to true when the addon key itself is absent (graceful
 *     degradation — never block UI on a missing config)
 *   - Module-level cache de-dupes concurrent calls and keeps a 30s TTL
 *   - On fetch failure, returns enabled=true (fail-open, matching the
 *     backend `policy_client` 30s-TTL fail-open contract from
 *     `.claude/rules/design-decisions.md`)
 *
 * NOTE: implementation file (`frontend/src/hooks/usePolicy.ts`) does not exist
 * yet — this test file should fail at import time (RED state). Phase 4
 * implementation will turn it green.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolicy, _resetPolicyCache } from "../usePolicy";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  _resetPolicyCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetPolicyCache();
});

describe("usePolicy", () => {
  it("starts with isLoading=true and enabled=true (fail-open default)", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        addons: { knowledge: { default: true, features: { editor: true } } },
      }),
    );

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    // Initial render: cache is cold so we are loading.
    expect(result.current.isLoading).toBe(true);
    // While loading, default to enabled (fail-open) so the editor mounts and
    // doesn't flash a "disabled" UI before the policy lookup completes.
    expect(result.current.enabled).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/drives/work/addon-policies");
  });

  it("returns enabled=false when features[feature] is false", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        addons: {
          knowledge: { default: true, features: { editor: false } },
        },
      }),
    );

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(false);
  });

  it("returns enabled=false when bool shorthand sets default=false", async () => {
    // drives.json: addons.knowledge: false  =>  { default: false, features: {} }
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        addons: { knowledge: { default: false, features: {} } },
      }),
    );

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(false);
  });

  it("falls back to default when feature is unlisted", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        addons: {
          knowledge: { default: true, features: { scanner: false } },
        },
      }),
    );

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // editor is unlisted -> fall back to default (true).
    expect(result.current.enabled).toBe(true);
  });

  it("returns enabled=true when the addon key is absent (graceful degradation)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ addons: {} }));

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });

  it("fail-open on fetch network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });

  it("fail-open when fetch returns a non-2xx status", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const { result } = renderHook(() =>
      usePolicy("work", "knowledge", "editor"),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });

  it("dedupes concurrent calls for the same drive", async () => {
    // Both renderHook calls happen before the first fetch resolves, so the
    // hook must coalesce them into a single in-flight request.
    let resolveFetch: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchSpy.mockReturnValueOnce(pending);

    const a = renderHook(() => usePolicy("work", "knowledge", "editor"));
    const b = renderHook(() => usePolicy("work", "knowledge", "scanner"));

    // Two consumers, but we expect a single network call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch(
      jsonResponse({
        addons: {
          knowledge: {
            default: true,
            features: { editor: false, scanner: true },
          },
        },
      }),
    );

    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    expect(a.result.current.enabled).toBe(false);
    expect(b.result.current.enabled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses cached response on remount of the same drive", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        addons: { knowledge: { default: true, features: { editor: false } } },
      }),
    );

    const first = renderHook(() => usePolicy("work", "knowledge", "editor"));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.enabled).toBe(false);
    first.unmount();

    // Second mount — cache is warm, no extra fetch.
    const second = renderHook(() => usePolicy("work", "knowledge", "editor"));
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.enabled).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when the drive changes (independent cache keys)", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          addons: {
            knowledge: { default: true, features: { editor: true } },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          addons: {
            knowledge: { default: true, features: { editor: false } },
          },
        }),
      );

    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) =>
        usePolicy(drive, "knowledge", "editor"),
      { initialProps: { drive: "work" } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/drives/work/addon-policies");

    rerender({ drive: "photos" });

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "/api/drives/photos/addon-policies",
    );
  });

  it("fetches with credentials so the hv_token cookie is sent", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ addons: {} }));

    renderHook(() => usePolicy("work", "knowledge", "editor"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0];
    // same-origin sends cookies for same-origin requests (relative URL),
    // and is safer than `include` if the path ever crosses origins later.
    expect(init?.credentials).toBe("same-origin");
  });
});
