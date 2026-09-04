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
  it("is beside when nothing has been chosen", () => {
    // The redesign's confirmed shape puts the transcript and chapters in
    // the inspector's tab strip, and that strip exists only in the
    // beside form. A stacked default would have shown the arrangement
    // the design settled on only to people who found the toggle.
    expect(readMediaLayout()).toBe("beside");
  });

  it("prefers the attribute, which is what the CSS is acting on", () => {
    document.documentElement.setAttribute(ATTRIBUTE, "beside");
    window.localStorage.setItem("media-layout-preference", "stacked");
    expect(readMediaLayout()).toBe("beside");
  });

  it("keeps a stored choice of the non-default", () => {
    // The half of the default change that matters: nobody who has
    // already chosen stacked gets moved by it.
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

    act(() => result.current[1]("beside"));

    // The CSS reads this; nothing in React has to move for the layout
    // to change.
    expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("beside");
    expect(window.localStorage.getItem("media-layout-preference")).toBe("beside");
    expect(result.current[0]).toBe("beside");
  });

  it("has the stored value on its very first render", () => {
    // Not "after mount". The shell moves the transcript between an
    // inspector tab and the canvas from this value, so a first commit
    // at the default would mount it beside the player and tear it down
    // again on the next one — a fetch, a clock subscription and a
    // scroll position, all discarded, for a reader who never asked for
    // the beside form.
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
    // Two of them now: the toggle in the page row and the shell that
    // decides where the transcript is drawn. Held per component, they
    // would disagree — the button showing one form while the layout
    // drew the other.
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

      act(() => result.current[1]("beside"));

      // Lost on reload, but the session it was chosen in still honours it.
      expect(document.documentElement.getAttribute(ATTRIBUTE)).toBe("beside");
      expect(result.current[0]).toBe("beside");
    } finally {
      setItem.mockRestore();
    }
  });
});
