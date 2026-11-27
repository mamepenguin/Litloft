/**
 * Narrower than `ridesFileDetailShell` and it has to stay that way: the
 * shell draws the page row for whatever rides it, and this asks the
 * separate question of which *canvas* goes inside it.
 *
 * @param knowledgeEditorEnabled  `usePolicy` is fail-open, and callers
 *   must pass only its `enabled`, never its `isLoading`. Reading the
 *   loading flag here would let the periodic refetch flip the layout out
 *   from under an open editor, which unmounts the textarea.
 * @param plainTextDocument  `usePlainTextDocument`'s decision, the only
 *   place a `.txt` is judged; this does not look at the name.
 */
export function usesDocumentShell(
  mimeType: string | undefined,
  knowledgeEditorEnabled: boolean,
  plainTextDocument: boolean,
): boolean {
  if (plainTextDocument) return true;
  if (mimeType === "text/html") return true;
  return mimeType === "text/markdown" && knowledgeEditorEnabled;
}

/**
 * `"canonical"` is `/drive/{drive}/{path}?file={id}`, the file's address.
 */
export type FileDetailSurface = "canonical";

const DOCUMENT_VIEWER_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/epub+zip",
]);

/** A viewer whose content brings its own margin, so the canvas adds none around it. */
export function isDocumentViewer(mimeType: string | undefined): boolean {
  return DOCUMENT_VIEWER_MIMES.has(mimeType ?? "");
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
  plainTextDocument: boolean;
}): boolean {
  if (
    usesDocumentShell(
      args.mimeType,
      args.knowledgeEditorEnabled,
      args.plainTextDocument,
    )
  ) {
    return true;
  }
  return args.fileType !== undefined;
}
