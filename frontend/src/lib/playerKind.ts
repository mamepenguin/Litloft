/**
 * Which player, if any, plays this file.
 *
 * Two decisions need this answer and they must not disagree:
 * `FilePreview` picks the player, and the file-detail layout picks
 * whether the companion rail can sit beside it. The `.loft` mime string
 * was already written out in two places before this module existed,
 * which is how such checks drift.
 *
 * Spec: docs/superpowers/specs/2026-08-11-transcript-following-playback.md §4.2
 */

export const LOFT_MIME = "application/vnd.litloft.loft+json";

export type PlayerKind = "video" | "audio" | "loft";

interface PlayableFile {
  mime_type?: string | null;
  file_type?: string | null;
}

export function playerKind(file: PlayableFile): PlayerKind | null {
  // `.loft` first, always. Filetype classification reports it as
  // `video` so that search's file_type filters include it, but a
  // native <video> cannot load a YouTube URL — checking file_type
  // first would route every .loft to the wrong player.
  if (file.mime_type === LOFT_MIME) return "loft";
  if (file.file_type === "video") return "video";
  if (file.file_type === "audio") return "audio";
  return null;
}
