import type { MediaController } from "@/lib/mediaController";

export interface LoftEmbedProps {
  fileId: string;
  url: string;
  onMediaController?: (mc: MediaController | null) => void;
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
}
