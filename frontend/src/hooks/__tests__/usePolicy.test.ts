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

    expect(result.current.isLoading).toBe(true);
    // Enabled while loading, so the editor does not flash a disabled UI.
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
    let resolveFetch: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchSpy.mockReturnValueOnce(pending);

    const a = renderHook(() => usePolicy("work", "knowledge", "editor"));
    const b = renderHook(() => usePolicy("work", "knowledge", "scanner"));

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
    // Not `include`: safer if the path ever crosses origins.
    expect(init?.credentials).toBe("same-origin");
  });
});
