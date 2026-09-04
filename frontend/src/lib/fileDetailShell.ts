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
