import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("selectFile uses router.replace (not push)", () => {
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("xyz789"));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/drive/work/Q1?file=xyz789");
  });

  it("selectFile preserves other query params", () => {
    mockSearchParams = new URLSearchParams("tag=foo");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("xyz"));
    const target = mockReplace.mock.calls[0][0] as string;
    expect(target).toContain("tag=foo");
    expect(target).toContain("file=xyz");
  });

  it("clearFile removes only the file param", () => {
    mockSearchParams = new URLSearchParams("file=abc&tag=foo");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());
    expect(mockReplace).toHaveBeenCalledWith("/drive/work/Q1?tag=foo");
  });

  it("clearFile is a no-op when no ?file present", () => {
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
