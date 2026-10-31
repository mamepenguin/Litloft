import { useEffect, useRef, useState, type ReactElement } from "react";

import { ProfileProvider } from "@/components/ProfileProvider";
import { createNativeVideoController, type MediaController } from "@/lib/mediaController";
import { usePlaybackProgress } from "@/lib/playbackProgress";

export interface RecordedSend {
  url: string;
  keepalive: boolean;
  body: string;
}

declare global {
  interface Window {
    __playedRangeSends?: RecordedSend[];
  }
}

/**
 * Records what the page hands to `fetch` before the request leaves, because
 * `keepalive` is a property of the call and not visible on the wire.
 */
function recordSends(): void {
  if (window.__playedRangeSends) return;
  window.__playedRangeSends = [];
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/played-ranges")) {
      window.__playedRangeSends!.push({
        url,
        keepalive: init?.keepalive === true,
        body: typeof init?.body === "string" ? init.body : "",
      });
    }
    return original(input, init);
  };
}

function Capture({ mc }: { mc: MediaController | null }): null {
  usePlaybackProgress({ mc, fileId: "e2e-media" });
  return null;
}

/** A real `<video>` driven through the shared progress hook. */
export function PlayedRangesArrangement(): ReactElement {
  recordSends();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mc, setMc] = useState<MediaController | null>(null);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (videoRef.current) setMc(createNativeVideoController(videoRef.current));
  }, []);

  return (
    <>
      {/* The video stays outside: the provider renders a different tree
          once it has read the cookie, which would remount the element the
          controller was built on. */}
      <ProfileProvider>{mounted ? <Capture mc={mc} /> : null}</ProfileProvider>
      <video ref={videoRef} id="played-ranges-video" src="./media/tone.wav" muted playsInline preload="auto" />
      <button type="button" id="played-ranges-unmount" onClick={() => setMounted(false)}>
        unmount
      </button>
    </>
  );
}
