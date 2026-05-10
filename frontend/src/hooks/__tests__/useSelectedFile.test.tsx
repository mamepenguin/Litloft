import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/drive/work/Q1";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import { useSelectedFile } from "../useSelectedFile";

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
  mockPathname = "/drive/work/Q1";
  mockSearchParams = new URLSearchParams();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

describe("useSelectedFile", () => {
  it("returns null when ?file is absent", () => {
    const { result } = renderHook(() => useSelectedFile());
    expect(result.current.fileId).toBeNull();
  });

  it("reads ?file param", () => {
    mockSearchParams = new URLSearchParams("file=abc123");
    const { result } = renderHook(() => useSelectedFile());
    expect(result.current.fileId).toBe("abc123");
  });

  it("first selection (?file goes from absent → present) uses router.push", () => {
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("xyz789"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/drive/work/Q1?file=xyz789", { scroll: false });
  });

  it("switching files (file id → other file id) uses router.replace", () => {
    mockSearchParams = new URLSearchParams("file=abc123");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("xyz789"));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/drive/work/Q1?file=xyz789", { scroll: false });
  });

  it("selectFile preserves other query params", () => {
    mockSearchParams = new URLSearchParams("tag=foo");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("xyz"));
    const target = mockPush.mock.calls[0][0] as string;
    expect(target).toContain("tag=foo");
    expect(target).toContain("file=xyz");
  });

  it("clearFile uses router.replace", () => {
    mockSearchParams = new URLSearchParams("file=abc&tag=foo");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());
    expect(mockReplace).toHaveBeenCalledWith("/drive/work/Q1?tag=foo", { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("clearFile is a no-op when no ?file present", () => {
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe("navigationGuard integration (PR-5)", () => {
    it("selectFile defers via navigationGuard when a source is dirty", () => {
      dirtyRegistry.set("any-file", "knowledge-editor", true);
      const { result } = renderHook(() => useSelectedFile());
      act(() => result.current.selectFile("xyz"));
      expect(mockPush).not.toHaveBeenCalled();
      expect(navigationGuard.getPending()).not.toBeNull();
      act(() => navigationGuard.confirm());
      expect(mockPush).toHaveBeenCalledWith(
        "/drive/work/Q1?file=xyz",
        { scroll: false },
      );
    });

    it("selectFile cancel drops the navigation", () => {
      dirtyRegistry.set("any-file", "knowledge-editor", true);
      const { result } = renderHook(() => useSelectedFile());
      act(() => result.current.selectFile("xyz"));
      act(() => navigationGuard.cancel());
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("clearFile defers via navigationGuard when a source is dirty", () => {
      mockSearchParams = new URLSearchParams("file=abc");
      dirtyRegistry.set("any-file", "knowledge-editor", true);
      const { result } = renderHook(() => useSelectedFile());
      act(() => result.current.clearFile());
      expect(mockReplace).not.toHaveBeenCalled();
      act(() => navigationGuard.confirm());
      expect(mockReplace).toHaveBeenCalledWith("/drive/work/Q1", {
        scroll: false,
      });
    });
  });
});
