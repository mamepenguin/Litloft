/**
 * SPEC-CORE-032 I15 — a file opened from the inbox walks with `nav=inbox`
 * in its URL, and leaving it returns to the inbox rather than to the
 * folder the file happens to sit in.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/drive/main/movies";
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
  mockPathname = "/drive/main/movies";
  mockSearchParams = new URLSearchParams();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

afterEach(() => {
  navigationGuard.reset();
  dirtyRegistry.reset();
});

const lastReplace = () => mockReplace.mock.calls.at(-1)?.[0];

describe("SPEC-CORE-032 I15 walking the inbox from the right pane", () => {
  it("SPEC-CORE-032 I15 keeps nav=inbox on the next file", () => {
    mockSearchParams = new URLSearchParams("file=abc&nav=inbox");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("def"));

    expect(lastReplace()).toBe("/drive/main/movies?file=def&nav=inbox");
  });

  it("SPEC-CORE-032 I15 keeps nav=inbox on the first file too", () => {
    mockSearchParams = new URLSearchParams("nav=inbox");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.selectFile("def"));

    expect(mockPush).toHaveBeenCalledWith(
      "/drive/main/movies?nav=inbox&file=def",
      { scroll: false },
    );
  });
});

describe("SPEC-CORE-032 I15 closing the detail", () => {
  it("SPEC-CORE-032 I15 returns to the inbox when the file was opened there", () => {
    mockSearchParams = new URLSearchParams("file=abc&nav=inbox");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());

    expect(lastReplace()).toBe("/drive/main?view=inbox");
  });

  it("SPEC-CORE-032 I15 returns to the inbox from a nested folder", () => {
    mockPathname = "/drive/main/movies/2026";
    mockSearchParams = new URLSearchParams("file=abc&nav=inbox&sort=title");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());

    expect(lastReplace()).toBe("/drive/main?view=inbox");
  });

  it("SPEC-CORE-032 I15 encodes the drive it returns to", () => {
    mockPathname = "/drive/my%20drive/movies";
    mockSearchParams = new URLSearchParams("file=abc&nav=inbox");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());

    expect(lastReplace()).toBe("/drive/my%20drive?view=inbox");
  });

  it.each([
    ["a folder walk", "file=abc&nav=folder&sort=title", "/drive/main/movies?nav=folder&sort=title"],
    ["no nav at all", "file=abc", "/drive/main/movies"],
  ])("SPEC-CORE-032 I15 leaves %s alone", (_case, search, expected) => {
    mockSearchParams = new URLSearchParams(search);
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());

    expect(lastReplace()).toBe(expected);
  });

  it("SPEC-CORE-032 I15 does nothing when no file is open", () => {
    mockSearchParams = new URLSearchParams("nav=inbox");
    const { result } = renderHook(() => useSelectedFile());
    act(() => result.current.clearFile());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
