import { describe, it, expect, beforeEach } from "vitest";
import { readAutoplayPreference } from "../autoplay";

describe("readAutoplayPreference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns false when preference is unset", () => {
    expect(readAutoplayPreference()).toBe(false);
  });

  it("returns true when stored value is 'true'", () => {
    window.localStorage.setItem("video-share-autoplay", "true");
    expect(readAutoplayPreference()).toBe(true);
  });

  it("returns false for any non-'true' stored value", () => {
    window.localStorage.setItem("video-share-autoplay", "false");
    expect(readAutoplayPreference()).toBe(false);
    window.localStorage.setItem("video-share-autoplay", "yes");
    expect(readAutoplayPreference()).toBe(false);
  });
});
