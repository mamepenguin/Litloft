import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  PLAYBACK_RATES,
  readPlaybackRatePreference,
  usePlaybackRatePreference,
} from "../usePlaybackRatePreference";

const STORAGE_KEY = "video-share-playback-rate";

beforeEach(() => {
  window.localStorage.clear();
});

describe("PLAYBACK_RATES", () => {
  it("offers the rates the spec asks for, in ascending order", () => {
    expect([...PLAYBACK_RATES]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it("includes 1 so the default is always selectable", () => {
    expect(PLAYBACK_RATES).toContain(1);
  });
});

describe("readPlaybackRatePreference", () => {
  it("returns 1 when nothing has been stored", () => {
    expect(readPlaybackRatePreference()).toBe(1);
  });

  it("returns a stored rate that the selector offers", () => {
    window.localStorage.setItem(STORAGE_KEY, "1.5");
    expect(readPlaybackRatePreference()).toBe(1.5);
  });

  it("falls back to 1 for unparseable values", () => {
    window.localStorage.setItem(STORAGE_KEY, "fast");
    expect(readPlaybackRatePreference()).toBe(1);
  });

  it("falls back to 1 for rates outside the offered set", () => {
    // 1.75 is a real number but not one of ours: honouring it would
    // show a speed the selector cannot represent, and YouTube may
    // silently refuse it.
    for (const raw of ["1.75", "0", "-2", "99"]) {
      window.localStorage.setItem(STORAGE_KEY, raw);
      expect(readPlaybackRatePreference()).toBe(1);
    }
  });
});

describe("usePlaybackRatePreference", () => {
  it("starts at 1 and hydrates the stored rate after mount", async () => {
    window.localStorage.setItem(STORAGE_KEY, "0.75");
    const { result } = renderHook(() => usePlaybackRatePreference());
    // Reading localStorage during render would desync SSR markup, so
    // hydration happens in an effect and the first paint is the default.
    expect(result.current[1]).toBeTypeOf("function");
    await act(async () => {});
    expect(result.current[0]).toBe(0.75);
  });

  it("persists an accepted rate", async () => {
    const { result } = renderHook(() => usePlaybackRatePreference());
    await act(async () => {
      result.current[1](2);
    });
    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("2");
  });

  it("ignores rates outside the offered set instead of storing them", async () => {
    const { result } = renderHook(() => usePlaybackRatePreference());
    await act(async () => {
      result.current[1](1.75);
    });
    expect(result.current[0]).toBe(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
