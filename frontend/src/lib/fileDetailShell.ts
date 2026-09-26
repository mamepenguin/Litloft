import { playerKind } from "./playerKind";

/**
 * Narrower than `ridesFileDetailShell` and it has to stay that way: the
 * shell draws the page row for whatever rides it, and this asks the
 * separate question of which *canvas* goes inside it.
 *
 * @param knowledgeEditorEnabled  `usePolicy` is fail-open, and callers
 *   must pass only its `enabled`, never its `isLoading`. Reading the
 *   loading flag here would let the periodic refetch flip the layout out
 *   from under an open editor, which unmounts the textarea.
 */
export function usesDocumentShell(
  mimeType: string | undefined,
  knowledgeEditorEnabled: boolean,
): boolean {
  if (mimeType === "text/html") return true;
  return mimeType === "text/markdown" && knowledgeEditorEnabled;
}

/**
 * `"canonical"` is `/drive/{drive}/{path}?file={id}`, the file's address.
 * `"collection"` is `/files/{id}`, reached only with `?collection=` /
 * `?folder_play=1`. The collection route is not where the inspector goes.
 */
export type FileDetailSurface = "canonical" | "collection";

/**
 * Named rather than matched: a `text/` prefix reaches every `text/*` that
 * is not the document form — `text/plain` and `text/vtt` among them — and
 * would hand each of them a floor on the strength of the name alone.
 */
const FLOORED_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/epub+zip",
]);

/**
 * A kind absent from here rides the shell and gets no floor, which is the
 * safe half: a viewer that is a short panel keeps its own height.
 *
 * Images are excluded: `FilePreview` already gives them `max-h-[70vh]`,
 * so a floor would add white space around a small photograph and nothing
 * else.
 */
export function viewerTakesCanvasFloor(
  fileType: string | undefined,
  mimeType: string | undefined,
): boolean {
  if (playerKind({ file_type: fileType, mime_type: mimeType }) !== null) {
    return false;
  }
  if (fileType === "archive") return true;
  return FLOORED_MIMES.has(mimeType ?? "");
}

/**
 * `fileType` is read for one thing only, and it is not a kind test: it
 * is undefined exactly while the file has not resolved, and a file that
 * does not exist yet has no shell.
 */
export function ridesFileDetailShell(args: {
  surface: FileDetailSurface;
  mimeType: string | undefined;
  fileType: string | undefined;
  knowledgeEditorEnabled: boolean;
}): boolean {
  if (usesDocumentShell(args.mimeType, args.knowledgeEditorEnabled)) return true;
  if (args.surface !== "canonical") return false;
  return args.fileType !== undefined;
}
