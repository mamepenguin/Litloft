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
