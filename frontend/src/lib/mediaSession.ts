export interface MediaSessionMetadataInput {
  title: string;
  artist?: string;
  album?: string;
  artwork?: readonly MediaImage[];
}

export interface MediaSessionHandlers {
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
}

const SEEK_OFFSET = 10;

export function setupMediaSession(
  media: HTMLMediaElement,
  metadata: MediaSessionMetadataInput,
  handlers: MediaSessionHandlers = {},
): () => void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return () => {};
  const ms = navigator.mediaSession;
  const Metadata = window.MediaMetadata;
  if (!ms || typeof Metadata !== "function") return () => {};

  ms.metadata = new Metadata({
    title: metadata.title,
    artist: metadata.artist ?? "",
    album: metadata.album ?? "",
    artwork: metadata.artwork ? [...metadata.artwork] : [],
  });

  const registered: MediaSessionAction[] = [];
  const register = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(action, handler);
      registered.push(action);
    } catch {
      // Action not supported in this browser — fine.
    }
  };

  register("play", () => {
    media.play().catch(() => {});
  });
  register("pause", () => {
    media.pause();
  });
  register("seekbackward", (details) => {
    const offset = details.seekOffset ?? SEEK_OFFSET;
    media.currentTime = Math.max(0, media.currentTime - offset);
  });
  register("seekforward", (details) => {
    const offset = details.seekOffset ?? SEEK_OFFSET;
    const limit = Number.isFinite(media.duration) ? media.duration : media.currentTime + offset;
    media.currentTime = Math.min(limit, media.currentTime + offset);
  });
  register("seekto", (details) => {
    if (details.seekTime == null) return;
    media.currentTime = details.seekTime;
  });
  if (handlers.onNextTrack) {
    const next = handlers.onNextTrack;
    register("nexttrack", () => next());
  }
  if (handlers.onPreviousTrack) {
    const prev = handlers.onPreviousTrack;
    register("previoustrack", () => prev());
  }

  const updateState = () => {
    ms.playbackState = media.paused || media.ended ? "paused" : "playing";
  };
  media.addEventListener("play", updateState);
  media.addEventListener("pause", updateState);
  media.addEventListener("ended", updateState);
  updateState();

  return () => {
    for (const action of registered) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }
    media.removeEventListener("play", updateState);
    media.removeEventListener("pause", updateState);
    media.removeEventListener("ended", updateState);
    ms.metadata = null;
    ms.playbackState = "none";
  };
}
