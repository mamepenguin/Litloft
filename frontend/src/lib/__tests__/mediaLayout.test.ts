import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { readMediaLayout, useMediaLayoutPreference } from "../mediaLayout";

const ATTRIBUTE = "data-media-layout";

beforeEach(() => {
  document.documentElement.removeAttribute(ATTRIBUTE);
  window.localStorage.clear();
  // "still applies the choice when storage refuses" leaves Storage.prototype
  // throwing if it fails before its own restore.
  vi.restoreAllMocks();
});

describe("readMediaLayout", () => {
  it("is beside when nothing has been chosen", () => {
    expect(readMediaLayout()).toBe("beside");
  });

  it("prefers the attribute, which is what the CSS is acting on", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "beside");
    window.localStorage.setItem("media-layout-preference", "stacked");
    expect(readMediaLayout()).toBe("beside");
  });

  it("keeps a stored choice of the non-default", () => {
    window.localStorage.setItem("media-layout-preference", "stacked");
    expect(readMediaLayout()).toBe("stacked");
  });

  it("falls back to storage before the init script has run", () => {
    window.localStorage.setItem("media-layout-preference", "beside");
    expect(readMediaLayout()).toBe("beside");
  });

  it("treats anything unrecognised as the default", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "sideways");
    expect(readMediaLayout()).toBe("beside");
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
    expect(result.current[0]).toBe("beside");

    act(() => result.current[1]("stacked"));

    expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("stacked");
    expect(window.localStorage.getItem("media-layout-preference")).toBe(
      "stacked",
    );
    expect(result.current[0]).toBe("stacked");
  });

  it("has the stored value on its very first render", () => {
    // The shell moves the transcript between an inspector tab and the
    // canvas from this value, so a first commit at the default would mount
    // it beside the player and tear it down again on the next one.
    window.localStorage.setItem("media-layout-preference", "stacked");
    const seen: string[] = [];
    renderHook(() => {
      const [layout] = useMediaLayoutPreference();
      seen.push(layout);
      return layout;
    });

    expect(seen[0]).toBe("stacked");
  });

  it("keeps every reader on the same value", () => {
    const first = renderHook(() => useMediaLayoutPreference());
    const second = renderHook(() => useMediaLayoutPreference());
    expect(second.result.current[0]).toBe("beside");

    act(() => first.result.current[1]("stacked"));

    expect(second.result.current[0]).toBe("stacked");
  });

  it("still applies the choice when storage refuses", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    try {
      const { result } = renderHook(() => useMediaLayoutPreference());

      act(() => result.current[1]("stacked"));

      // Lost on reload, but the session it was chosen in still honours it.
      expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("stacked");
      expect(result.current[0]).toBe("stacked");
    } finally {
      setItem.mockRestore();
    }
  });
});
