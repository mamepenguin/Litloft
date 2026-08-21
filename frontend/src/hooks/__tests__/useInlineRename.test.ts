import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInlineRename } from "../useInlineRename";

function setup() {
  const onRenamed = vi.fn();
  const { result } = renderHook(() => useInlineRename(onRenamed));
  return { result, onRenamed };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useInlineRename", () => {
  it("starts with nothing being edited", () => {
    const { result } = setup();
    expect(result.current.editingPath).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("edits the path it is asked to", () => {
    const { result } = setup();
    act(() => result.current.start("a/b"));
    expect(result.current.editingPath).toBe("a/b");
  });

  it("leaves edit mode and refreshes after a successful rename", async () => {
    const { result, onRenamed } = setup();
    act(() => result.current.start("a/b"));

    await act(async () => {
      await result.current.commit(() => Promise.resolve());
    });

    expect(result.current.editingPath).toBeNull();
    expect(onRenamed).toHaveBeenCalled();
  });

  it("stays in edit mode and does not refresh when the rename fails", async () => {
    const { result, onRenamed } = setup();
    act(() => result.current.start("a/b"));

    await act(async () => {
      await expect(
        result.current.commit(() =>
          Promise.reject(new Error("API error: 409 Conflict")),
        ),
      ).rejects.toThrow();
    });

    expect(result.current.editingPath).toBe("a/b");
    expect(onRenamed).not.toHaveBeenCalled();
  });

  describe("turns transport errors into something a person can read", () => {
    it.each([
      ["API error: 409 Conflict", "already taken"],
      ["API error: 403 Forbidden", "read-only"],
      ["API error: 404 Not Found", "no longer exists"],
      ["API error: 500", "Rename failed"],
      ["network unreachable", "Rename failed"],
    ])("%s", async (raw, expected) => {
      const { result } = setup();
      act(() => result.current.start("a/b"));

      let message = "";
      await act(async () => {
        await result.current
          .commit(() => Promise.reject(new Error(raw)))
          .catch((e: Error) => {
            message = e.message;
          });
      });

      expect(message).toContain(expected);
    });
  });

  it("surfaces an abandoned edit's reason, then clears it", () => {
    const { result } = setup();
    act(() => result.current.start("a/b"));

    act(() => result.current.cancel("That name is already taken"));
    expect(result.current.editingPath).toBeNull();
    expect(result.current.error).toBe("That name is already taken");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.error).toBeNull();
  });

  it("keeps no error for an ordinary cancel", () => {
    const { result } = setup();
    act(() => result.current.start("a/b"));
    act(() => result.current.cancel());
    expect(result.current.editingPath).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clears a stale message when the next edit begins", () => {
    const { result } = setup();
    act(() => result.current.cancel("boom"));
    expect(result.current.error).toBe("boom");
    act(() => result.current.start("c/d"));
    expect(result.current.error).toBeNull();
  });
});
