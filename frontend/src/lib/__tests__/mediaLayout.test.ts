import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { readMediaLayout, useMediaLayoutPreference } from "../mediaLayout";

const ATTRIBUTE = "data-media-layout";

beforeEach(() => {
  document.documentElement.removeAttribute(ATTRIBUTE);
  window.localStorage.clear();
  // "still applies the choice when storage refuses" leaves Storage.prototype
  // throwing if it fails before its own restore. That patch is shared by
  // localStorage and sessionStorage, so an unrestored one takes the rest of the
  // file down with it — a cascade that reports the wrong culprit.
  vi.restoreAllMocks();
});

describe("readMediaLayout", () => {
  it("is stacked when nothing has been chosen", () => {
    expect(readMediaLayout()).toBe("stacked");
  });

  it("prefers the attribute, which is what the CSS is acting on", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "beside");
    window.localStorage.setItem("media-layout-preference", "stacked");
    expect(readMediaLayout()).toBe("beside");
  });

  it("falls back to storage before the init script has run", () => {
    window.localStorage.setItem("media-layout-preference", "beside");
    expect(readMediaLayout()).toBe("beside");
  });

  it("treats anything unrecognised as stacked", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "sideways");
    expect(readMediaLayout()).toBe("stacked");
  });
});

describe("useMediaLayoutPreference", () => {
  it("settles on the stored value after mount", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "beside");
    const { result } = renderHook(() => useMediaLayoutPreference());
    expect(result.current[0]).toBe("beside");
  });

  it("drives the layout through the attribute, not a re-render", () => {
    const { result } = renderHook(() => useMediaLayoutPreference());

    act(() => result.current[1]("beside"));

    // The CSS reads this; nothing in React has to move for the layout
    // to change.
    expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("beside");
    expect(window.localStorage.getItem("media-layout-preference")).toBe("beside");
    expect(result.current[0]).toBe("beside");
  });

  it("still applies the choice when storage refuses", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    try {
      const { result } = renderHook(() => useMediaLayoutPreference());

      act(() => result.current[1]("beside"));

      // Lost on reload, but the session it was chosen in still honours it.
      expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("beside");
      expect(result.current[0]).toBe("beside");
    } finally {
      setItem.mockRestore();
    }
  });
});
