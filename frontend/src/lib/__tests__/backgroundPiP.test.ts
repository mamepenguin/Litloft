import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  supportsPictureInPicture,
  isInPictureInPicture,
  enterPictureInPicture,
  setupBackgroundPiP,
} from "../backgroundPiP";

type MutableDoc = {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
};

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function fakeVideo(overrides: Partial<HTMLVideoElement> & Record<string, unknown> = {}): HTMLVideoElement {
  const base = {
    paused: false,
    ended: false,
    disablePictureInPicture: false,
    requestPictureInPicture: vi.fn().mockResolvedValue(undefined),
  };
  return Object.assign(base, overrides) as unknown as HTMLVideoElement;
}

const originalPiPEnabled = (document as MutableDoc).pictureInPictureEnabled;
const originalPiPElement = (document as MutableDoc).pictureInPictureElement;

beforeEach(() => {
  (document as MutableDoc).pictureInPictureEnabled = true;
  (document as MutableDoc).pictureInPictureElement = null;
});

afterEach(() => {
  (document as MutableDoc).pictureInPictureEnabled = originalPiPEnabled;
  (document as MutableDoc).pictureInPictureElement = originalPiPElement;
});

describe("supportsPictureInPicture", () => {
  it("returns true when standard API is available", () => {
    const video = fakeVideo();
    expect(supportsPictureInPicture(video)).toBe(true);
  });

  it("returns false when disablePictureInPicture is set", () => {
    const video = fakeVideo({ disablePictureInPicture: true });
    expect(supportsPictureInPicture(video)).toBe(false);
  });

  it("falls back to webkit API on iOS Safari", () => {
    (document as MutableDoc).pictureInPictureEnabled = false;
    const webkitSupports = vi.fn().mockReturnValue(true);
    const video = fakeVideo({
      requestPictureInPicture: undefined,
      webkitSupportsPresentationMode: webkitSupports,
    });
    expect(supportsPictureInPicture(video)).toBe(true);
    expect(webkitSupports).toHaveBeenCalledWith("picture-in-picture");
  });

  it("returns false when no API is available", () => {
    (document as MutableDoc).pictureInPictureEnabled = false;
    const video = fakeVideo({ requestPictureInPicture: undefined });
    expect(supportsPictureInPicture(video)).toBe(false);
  });
});

describe("isInPictureInPicture", () => {
  it("is true when video matches document.pictureInPictureElement", () => {
    const video = fakeVideo();
    (document as MutableDoc).pictureInPictureElement = video as unknown as Element;
    expect(isInPictureInPicture(video)).toBe(true);
  });

  it("is true when webkitPresentationMode is picture-in-picture", () => {
    const video = fakeVideo({ webkitPresentationMode: "picture-in-picture" });
    expect(isInPictureInPicture(video)).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isInPictureInPicture(fakeVideo())).toBe(false);
  });
});

describe("enterPictureInPicture", () => {
  it("prefers the standard API when available", async () => {
    const req = vi.fn().mockResolvedValue(undefined);
    const webkitSet = vi.fn();
    const video = fakeVideo({
      requestPictureInPicture: req,
      webkitSetPresentationMode: webkitSet,
      webkitSupportsPresentationMode: vi.fn().mockReturnValue(true),
    });
    await enterPictureInPicture(video);
    expect(req).toHaveBeenCalled();
    expect(webkitSet).not.toHaveBeenCalled();
  });

  it("uses webkit fallback when standard API is missing", async () => {
    (document as MutableDoc).pictureInPictureEnabled = false;
    const webkitSet = vi.fn();
    const video = fakeVideo({
      requestPictureInPicture: undefined,
      webkitSetPresentationMode: webkitSet,
      webkitSupportsPresentationMode: vi.fn().mockReturnValue(true),
    });
    await enterPictureInPicture(video);
    expect(webkitSet).toHaveBeenCalledWith("picture-in-picture");
  });

  it("is a no-op when already in PiP", async () => {
    const video = fakeVideo();
    (document as MutableDoc).pictureInPictureElement = video as unknown as Element;
    await enterPictureInPicture(video);
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
  });
});

describe("setupBackgroundPiP", () => {
  it("enters PiP when document becomes hidden during playback", async () => {
    const req = vi.fn().mockResolvedValue(undefined);
    const video = fakeVideo({ requestPictureInPicture: req });
    const cleanup = setupBackgroundPiP(video);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(req).toHaveBeenCalled();
    cleanup();
  });

  it("skips when video is paused", () => {
    const req = vi.fn().mockResolvedValue(undefined);
    const video = fakeVideo({ paused: true, requestPictureInPicture: req });
    const cleanup = setupBackgroundPiP(video);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(req).not.toHaveBeenCalled();
    cleanup();
  });

  it("removes the listener on cleanup", () => {
    const req = vi.fn().mockResolvedValue(undefined);
    const video = fakeVideo({ requestPictureInPicture: req });
    const cleanup = setupBackgroundPiP(video);
    cleanup();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(req).not.toHaveBeenCalled();
  });

  it("swallows PiP request failures", async () => {
    const req = vi.fn().mockRejectedValue(new Error("NotAllowed"));
    const video = fakeVideo({ requestPictureInPicture: req });
    const cleanup = setupBackgroundPiP(video);

    setVisibility("hidden");
    expect(() => document.dispatchEvent(new Event("visibilitychange"))).not.toThrow();
    await Promise.resolve();
    cleanup();
  });
});
