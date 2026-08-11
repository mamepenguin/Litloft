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
  it("starts unset when nothing has been chosen", () => {
    const { result } = renderHook(() => useCaptionsPreference());
    expect(result.current[0]).toBeNull();
  });

  it("restores a saved preference", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useCaptionsPreference());
    expect(result.current[0]).toBe(true);
  });

  it("distinguishes a saved off choice from an unset preference", () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    const { result } = renderHook(() => useCaptionsPreference());
    expect(result.current[0]).toBe(false);
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

  it("keeps consumers in the same tab in sync", () => {
    const first = renderHook(() => useCaptionsPreference());
    const second = renderHook(() => useCaptionsPreference());

    act(() => first.result.current[1](true));

    expect(first.result.current[0]).toBe(true);
    expect(second.result.current[0]).toBe(true);
  });

  it("reads unset for anything that is not an explicit choice", () => {
    window.localStorage.setItem(STORAGE_KEY, "yes please");
    expect(readCaptionsPreference()).toBeNull();
  });

  it("renders unset on the first pass so the server and client agree", () => {
    // Reading localStorage during render would make the markup differ
    // between the server and the client's first paint.
    window.localStorage.setItem(STORAGE_KEY, "true");
    let firstRenderValue: boolean | null | undefined;
    renderHook(() => {
      const [enabled] = useCaptionsPreference();
      if (firstRenderValue === undefined) firstRenderValue = enabled;
      return enabled;
    });
    expect(firstRenderValue).toBeNull();
  });
});
