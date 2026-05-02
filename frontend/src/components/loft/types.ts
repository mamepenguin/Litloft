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
}
