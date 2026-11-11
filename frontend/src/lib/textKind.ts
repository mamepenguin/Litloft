const TEXT_SUFFIXES = [".md", ".markdown", ".txt"];

/**
 * The `text` kind, as the backend's `_KIND_MIMES` / `_KIND_SUFFIXES` define
 * it. Not `text/plain`: that mime also lands on `.c`, `.h` and `.pl`.
 */
export function isTextKind(mimeType: string | null | undefined, filename: string): boolean {
  if (mimeType === "text/markdown") return true;
  const lowered = filename.toLowerCase();
  return TEXT_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

/** Core's write cap for `PUT /content` (`_TEXT_WRITE_MAX_BYTES`). */
export const PLAIN_TEXT_EDIT_MAX_BYTES = 1_048_576;

/**
 * A `.txt` the knowledge editor can take. Not `isTextKind`: `text/plain`
 * also lands on `.c`, `.h` and `.pl`, and a `.md` recorded as `text/plain`
 * keeps the canvas.
 */
export function isPlainTextEditCandidate(file: {
  filename: string;
  mime_type: string;
  file_size: number;
}): boolean {
  return (
    file.mime_type === "text/plain" &&
    file.filename.toLowerCase().endsWith(".txt") &&
    file.file_size <= PLAIN_TEXT_EDIT_MAX_BYTES
  );
}
