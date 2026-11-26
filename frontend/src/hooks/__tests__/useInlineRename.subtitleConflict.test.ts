import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages-core/en.json";
import { ApiStatusError } from "@/lib/apiError";
import { useInlineRename } from "../useInlineRename";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/alfa",
}));

function subtitleConflict() {
  return Object.assign(new ApiStatusError(409, "API error: 409 Conflict"), {
    code: "subtitle_name_taken",
    names: ["Night.ja.srt"],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-185 185.8 I11: the folder tree's inline rename", () => {
  it("turns a subtitle 409 into its translated message and names, not the generic conflict", async () => {
    const { result } = renderHook(() => useInlineRename(vi.fn()));
    act(() => result.current.start("a/b"));

    let message = "";
    await act(async () => {
      await result.current
        .commit(() => Promise.reject(subtitleConflict()))
        .catch((error: Error) => {
          message = error.message;
        });
    });

    expect(message).not.toBe(en.inlineRename.error.conflict);
    expect(message).not.toContain(en.inlineRename.error.conflict);
    expect(message).not.toContain("subtitle_");
    expect(message).toContain("Night.ja.srt");
    expect(result.current.editingPath).toBe("a/b");
  });

  it("keeps the generic conflict text for a 409 with no subtitle code", async () => {
    const { result } = renderHook(() => useInlineRename(vi.fn()));
    act(() => result.current.start("a/b"));

    let message = "";
    await act(async () => {
      await result.current
        .commit(() => Promise.reject(new Error("API error: 409 Conflict")))
        .catch((error: Error) => {
          message = error.message;
        });
    });

    expect(message).toBe(en.inlineRename.error.conflict);
  });
});
