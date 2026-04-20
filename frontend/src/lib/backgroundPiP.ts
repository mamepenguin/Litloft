interface WebKitVideoElement extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}

export function supportsPictureInPicture(video: HTMLVideoElement): boolean {
  if (video.disablePictureInPicture) return false;
  if (typeof document !== "undefined" && document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
    return true;
  }
  const wk = video as WebKitVideoElement;
  if (typeof wk.webkitSupportsPresentationMode === "function") {
    return wk.webkitSupportsPresentationMode("picture-in-picture");
  }
  return false;
}

export function isInPictureInPicture(video: HTMLVideoElement): boolean {
  if (typeof document !== "undefined" && document.pictureInPictureElement === video) return true;
  const wk = video as WebKitVideoElement;
  return wk.webkitPresentationMode === "picture-in-picture";
}

export async function enterPictureInPicture(video: HTMLVideoElement): Promise<void> {
  if (isInPictureInPicture(video)) return;
  if (typeof video.requestPictureInPicture === "function" && typeof document !== "undefined" && document.pictureInPictureEnabled) {
    await video.requestPictureInPicture();
    return;
  }
  const wk = video as WebKitVideoElement;
  if (typeof wk.webkitSetPresentationMode === "function" && wk.webkitSupportsPresentationMode?.("picture-in-picture")) {
    wk.webkitSetPresentationMode("picture-in-picture");
  }
}

export function setupBackgroundPiP(video: HTMLVideoElement): () => void {
  if (typeof document === "undefined") return () => {};

  const handler = () => {
    if (document.visibilityState !== "hidden") return;
    if (video.paused || video.ended) return;
    if (isInPictureInPicture(video)) return;
    if (!supportsPictureInPicture(video)) return;
    enterPictureInPicture(video).catch(() => {
      // Silent: PiP request may be rejected without a user gesture, no element
      // ready yet, etc. Falling back to the browser's default behaviour is fine.
    });
  };

  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
