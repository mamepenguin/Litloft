import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";
import { useGuardedRouter } from "../useGuardedRouter";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockBack = vi.fn();
const mockForward = vi.fn();
const mockRefresh = vi.fn();
const mockPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    forward: mockForward,
    refresh: mockRefresh,
    prefetch: mockPrefetch,
  }),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockForward.mockReset();
  mockRefresh.mockReset();
  mockPrefetch.mockReset();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

afterEach(() => {
  navigationGuard.reset();
  dirtyRegistry.reset();
});

describe("useGuardedRouter", () => {
  it("push runs router.push immediately when nothing is dirty", () => {
    const { result } = renderHook(() => useGuardedRouter());
    result.current.push("/foo", { scroll: false });
    expect(mockPush).toHaveBeenCalledWith("/foo", { scroll: false });
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("push defers via navigationGuard when dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const { result } = renderHook(() => useGuardedRouter());
    result.current.push("/foo");
    expect(mockPush).not.toHaveBeenCalled();
    expect(navigationGuard.getPending()).not.toBeNull();
    navigationGuard.confirm();
    expect(mockPush).toHaveBeenCalledWith("/foo", undefined);
  });

  it("replace defers via navigationGuard when dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const { result } = renderHook(() => useGuardedRouter());
    result.current.replace("/bar", { scroll: false });
    expect(mockReplace).not.toHaveBeenCalled();
    navigationGuard.confirm();
    expect(mockReplace).toHaveBeenCalledWith("/bar", { scroll: false });
  });

  it("cancel drops the queued navigation", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const { result } = renderHook(() => useGuardedRouter());
    result.current.push("/foo");
    navigationGuard.cancel();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("non-navigating helpers (back / forward / refresh / prefetch) pass through unchanged", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const { result } = renderHook(() => useGuardedRouter());
    result.current.back();
    result.current.forward();
    result.current.refresh();
    result.current.prefetch("/x");
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockForward).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith("/x");
  });
});
