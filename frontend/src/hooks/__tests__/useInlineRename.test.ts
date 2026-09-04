import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RENAME_FOCUS_ATTR, useInlineRename } from "../useInlineRename";

function setup() {
  const onRenamed = vi.fn();
  const { result } = renderHook(() => useInlineRename(onRenamed));
  return { result, onRenamed };
}

function rowFor(path: string): HTMLButtonElement {
  const row = document.createElement("button");
  row.setAttribute(RENAME_FOCUS_ATTR, path);
  document.body.appendChild(row);
  return row;
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

  it("hands focus back to the row the edit came from", () => {
    const row = rowFor("a/b");
    const { result } = setup();
    act(() => result.current.start("a/b"));

    act(() => result.current.cancel());

    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it("keeps looking until the renamed row comes back", () => {
    // A successful rename refreshes the list, so the row the edit began
    // on is gone at the moment focus is handed back.
    const { result } = setup();
    act(() => result.current.start("a/b"));
    act(() => result.current.cancel());
    expect(document.activeElement).toBe(document.body);

    const row = rowFor("a/b");
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it("still restores focus when effects are double-invoked", () => {
    // StrictMode runs mount -> cleanup -> mount while keeping the refs,
    // and `next dev` turns it on for the App Router. A liveness flag that
    // is only ever cleared would leave this hook inert from the first
    // render on, so every rename in development would drop focus to
    // <body> — the one thing this hook exists to prevent.
    const row = rowFor("a/b");
    const { result } = renderHook(() => useInlineRename(vi.fn()), {
      wrapper: StrictMode,
    });
    act(() => result.current.start("a/b"));

    act(() => result.current.cancel());

    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it("arms no error timer once it has been unmounted", () => {
    const { result, unmount } = renderHook(() => useInlineRename(vi.fn()));
    act(() => result.current.start("a/b"));
    unmount();
    const pending = vi.getTimerCount();

    act(() => result.current.cancel("That name is already taken"));

    expect(vi.getTimerCount()).toBe(pending);
  });

  it("stops chasing focus once it has been unmounted", () => {
    // The unmount is itself a way to abandon an edit: tearing down a
    // focused editor fires blur, and the `cancel` that follows lands
    // after this hook's cleanup has already run. A poll armed then has
    // no owner left to clear it, and the lookup is by attribute across
    // the whole document — so it lands on whatever row has taken the
    // path since, in a screen this hook was never part of.
    const onRenamed = vi.fn();
    const { result, unmount } = renderHook(() => useInlineRename(onRenamed));
    act(() => result.current.start("Notes"));

    unmount();
    act(() => result.current.cancel());

    const row = document.createElement("button");
    row.setAttribute(RENAME_FOCUS_ATTR, "Notes");
    document.body.appendChild(row);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(document.activeElement).not.toBe(row);
    row.remove();
  });

  it("clears a stale message when the next edit begins", () => {
    const { result } = setup();
    act(() => result.current.cancel("boom"));
    expect(result.current.error).toBe("boom");
    act(() => result.current.start("c/d"));
    expect(result.current.error).toBeNull();
  });
});
