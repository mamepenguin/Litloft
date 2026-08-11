import type { MediaController } from "@/lib/mediaController";
import type { MediaSessionMetadataInput } from "@/lib/mediaSession";

export interface LoftEmbedProps {
  fileId: string;
  url: string;
  onMediaController?: (mc: MediaController | null) => void;
  /**
   * What the OS should show for this file on the lock screen,
   * notification shade or car display.
   *
   * Core supplies it because core owns file metadata; the embed decides
   * whether it can act on it. Like `onEnded` this is a capability, not
   * a requirement: an embed with no handle on playback (a plain iframe)
   * simply ignores it, and the platform shows whatever the provider
   * chose to publish for itself.
   */
  mediaSessionMetadata?: MediaSessionMetadataInput;
  /**
   * Seconds to seek to once the player is ready. Used by intelligence
   * Ask citation jumps (URL `?t=`). When provided AND non-zero, this
   * overrides the per-file saved-progress resume — a citation click
   * is an explicit "land here" instruction and must win over the
   * silent continue-watching heuristic. Embeds that don't support
   * runtime seeks (e.g. plain Vimeo iframe) should encode the offset
   * in the initial src URL.
   */
  initialTime?: number;
  /**
   * The file's real duration in seconds, from Litloft's own metadata
   * (yt-dlp at import time), or null when we never captured one.
   *
   * Embeds cannot trust the player for this. The YouTube IFrame API
   * reports 0 until metadata loads — which happens after playback
   * starts, i.e. potentially after a pre-roll ad has begun — and during
   * an ad it reports the *ad's* duration. A trustworthy duration is
   * what makes ad detection possible at all, and it lets the seek bar
   * show the right total before the player knows it.
   */
  durationHint?: number | null;
  /**
   * Called once the provider reports that playback reached the end.
   *
   * Optional on purpose: it is a *capability*, not a requirement. A
   * provider that cannot observe completion — a plain iframe embed,
   * say — simply never calls it and stays fully playable. Core must
   * therefore treat "never fired" as "unknown", never as "not
   * finished", and must not fabricate a completed state on its behalf.
   *
   * Wiring this up is what lets `.loft` files take part in the same
   * end-of-playback lifecycle native media already has (Collection
   * advance today, a generic playback queue later) without Core
   * gaining any knowledge of Media Import.
   *
   * Spec: 2026-08-10-media-import-watch-surface.md §4.3.
   */
  onEnded?: () => void;
}
