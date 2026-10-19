import type { MediaController } from "@/lib/mediaController";
import type { MediaSessionMetadataInput } from "@/lib/mediaSession";

export interface LoftEmbedProps {
  fileId: string;
  url: string;
  onMediaController?: (mc: MediaController | null) => void;
  /**
   * A capability, not a requirement: an embed with no handle on playback
   * (a plain iframe) simply ignores it.
   */
  mediaSessionMetadata?: MediaSessionMetadataInput;
  /**
   * When provided AND non-zero, this overrides the per-file saved-progress
   * resume — a citation click is an explicit "land here" instruction and
   * must win over the silent continue-watching heuristic. Embeds that don't
   * support runtime seeks (e.g. plain Vimeo iframe) should encode the offset
   * in the initial src URL.
   */
  initialTime?: number;
  /**
   * Embeds cannot trust the player for this. The YouTube IFrame API
   * reports 0 until metadata loads — potentially after a pre-roll ad has
   * begun — and during an ad it reports the *ad's* duration.
   */
  durationHint?: number | null;
  /**
   * Optional on purpose: a provider that cannot observe completion — a
   * plain iframe embed, say — simply never calls it. Core must therefore
   * treat "never fired" as "unknown", never as "not finished", and must not
   * fabricate a completed state on its behalf.
   */
  onEnded?: () => void;
  /**
   * The file's own thumbnail, given only when it has one. An embed whose
   * frame is blank while it loads can hold this over it; one that draws
   * its own poster ignores it.
   */
  posterUrl?: string;
}
