import { playerKind } from "./playerKind";

/**
 * Does this file bring its own page row?
 *
 * Markdown notes and HTML previews ride `FileDetailShell`, which draws
 * the page row itself because it also owns the inspector toggle that
 * sits in it. Every other type gets the row from its host. A host that
 * draws one anyway ends up with two breadcrumbs and, on a phone, two
 * back controls.
 *
 * This predicate used to be written out at each of the three places
 * that need it, with a comment at one of them asking the other two to
 * stay in lockstep. They did not: the fullscreen host never had it at
 * all. One function instead, so there is nothing to keep in step.
 *
 * @param mimeType  The file's mime type, or undefined before it resolves.
 * @param knowledgeEditorEnabled  The drive's `knowledge` / `editor`
 *   policy. `usePolicy` is fail-open — it reports enabled during both
 *   the first load and the 30s-TTL background refetch — and callers
 *   must pass only its `enabled`, never its `isLoading`. Reading the
 *   loading flag here would let the periodic refetch flip the layout out
 *   from under an open editor, which unmounts the textarea and re-fires
 *   every child effect: the 30-second reload-while-typing bug.
 */
export function usesDocumentShell(
  mimeType: string | undefined,
  knowledgeEditorEnabled: boolean,
): boolean {
  if (mimeType === "text/html") return true;
  return mimeType === "text/markdown" && knowledgeEditorEnabled;
}

/**
 * Which file-detail surface is asking.
 *
 * `"canonical"` is `/drive/{drive}/{path}?file={id}`, the URL the app
 * treats as a file's address. `"collection"` is `/files/{id}`, reached
 * only with `?collection=` / `?folder_play=1` — the theatre for
 * collection playback, where a player and the collection's own list
 * share one column.
 *
 * The two differ because the design settled that the collection route
 * is not where the inspector goes: the canonical URL is the file's
 * address, so building a second inspector there would be work to throw
 * away. It keeps the layout it has.
 */
export type FileDetailSurface = "canonical" | "collection";

/**
 * File kinds routed through `FileDetailShell` on the canonical surface.
 *
 * Media joined in 2026-09: the shell is what gives it a page row, an
 * inspector and a tab strip. PDF, archives and images follow, and they
 * join by being added here — one list, so a kind cannot be routed
 * through the shell by the layout while a host still draws it a second
 * page row.
 */
function ridesShellAsMedia(
  fileType: string | undefined,
  mimeType: string | undefined,
): boolean {
  return playerKind({ file_type: fileType, mime_type: mimeType }) !== null;
}

/**
 * Does this file's detail page ride `FileDetailShell` on this surface?
 *
 * The document half is surface-independent: a Markdown note has drawn
 * its own row on both surfaces since long before this, and taking that
 * away would be a regression rather than a scoping decision. The media
 * half is canonical-only, per `FileDetailSurface`.
 */
export function ridesFileDetailShell(args: {
  surface: FileDetailSurface;
  mimeType: string | undefined;
  fileType: string | undefined;
  knowledgeEditorEnabled: boolean;
}): boolean {
  if (usesDocumentShell(args.mimeType, args.knowledgeEditorEnabled)) return true;
  if (args.surface !== "canonical") return false;
  return ridesShellAsMedia(args.fileType, args.mimeType);
}
