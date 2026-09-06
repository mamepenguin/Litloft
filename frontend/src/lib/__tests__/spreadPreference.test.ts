import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  LEGACY_SPLIT_MODE_KEY,
  SPREAD_MODE_KEY,
  readSpreadMode,
  writeSpreadMode,
} from "../spreadPreference";

describe("the spread preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to off where nothing is stored", () => {
    expect(readSpreadMode()).toBe(false);
  });

  it("carries the old key over, once, and takes it away", () => {
    // The setting was called `split-mode` when splitting was all it did.
    // A reader who had it on should not have to turn it on again.
    localStorage.setItem(LEGACY_SPLIT_MODE_KEY, "true");

    expect(readSpreadMode()).toBe(true);
    expect(localStorage.getItem(SPREAD_MODE_KEY)).toBe("true");
    expect(localStorage.getItem(LEGACY_SPLIT_MODE_KEY)).toBeNull();
  });

  it("carries an off over as an off, not as an absence", () => {
    localStorage.setItem(LEGACY_SPLIT_MODE_KEY, "false");
    expect(readSpreadMode()).toBe(false);
    expect(localStorage.getItem(SPREAD_MODE_KEY)).toBe("false");
    expect(localStorage.getItem(LEGACY_SPLIT_MODE_KEY)).toBeNull();
  });

  it("lets a later choice stand over the migrated one", () => {
    // The reason the old key is consumed rather than left behind: it is
    // the one that used to win, so leaving it would revert every "off"
    // on the next read.
    localStorage.setItem(LEGACY_SPLIT_MODE_KEY, "true");
    expect(readSpreadMode()).toBe(true);

    writeSpreadMode(false);
    expect(readSpreadMode()).toBe(false);
  });

  it("still answers with the migrated value when the write is refused", () => {
    // Safari in private browsing reads and refuses to write. The
    // `setItem` used to throw past the answer and into a `catch` that
    // returned the default, so the one reader this migration exists for
    // opened in single-page mode — every time, since the removal never
    // ran either.
    localStorage.setItem(LEGACY_SPLIT_MODE_KEY, "true");
    const setItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => {
      if (k === SPREAD_MODE_KEY) throw new DOMException("QuotaExceeded");
      setItem(k, v);
    });

    expect(readSpreadMode()).toBe(true);
    vi.restoreAllMocks();
  });

  it("prefers the new key when both are somehow present", () => {
    localStorage.setItem(SPREAD_MODE_KEY, "false");
    localStorage.setItem(LEGACY_SPLIT_MODE_KEY, "true");
    expect(readSpreadMode()).toBe(false);
  });
});
