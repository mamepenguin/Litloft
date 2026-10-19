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
