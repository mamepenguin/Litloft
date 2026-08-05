import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCaptionsPreference,
  readCaptionsPreference,
} from "../useCaptionsPreference";

const STORAGE_KEY = "video-share-captions";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useCaptionsPreference", () => {
  it("starts off when nothing has been chosen", () => {
    // Subtitles are an opt-in: a viewer who has never asked for them
    // should not get them.
    const { result } = renderHook(() => useCaptionsPreference());
    expect(result.current[0]).toBe(false);
  });

  it("restores a saved preference", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useCaptionsPreference());
    expect(result.current[0]).toBe(true);
  });

  it("persists a new choice", () => {
    const { result } = renderHook(() => useCaptionsPreference());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("persists turning them back off", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useCaptionsPreference());
    act(() => result.current[1](false));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("reads false for anything that is not an explicit yes", () => {
    window.localStorage.setItem(STORAGE_KEY, "yes please");
    expect(readCaptionsPreference()).toBe(false);
  });

  it("renders false on the first pass so the server and client agree", () => {
    // Reading localStorage during render would make the markup differ
    // between the server and the client's first paint.
    window.localStorage.setItem(STORAGE_KEY, "true");
    let firstRenderValue: boolean | null = null;
    renderHook(() => {
      const [enabled] = useCaptionsPreference();
      firstRenderValue ??= enabled;
      return enabled;
    });
    expect(firstRenderValue).toBe(false);
  });
});
