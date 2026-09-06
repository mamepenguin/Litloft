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
 * Media joined in 2026-09, then PDF, archives and images: the shell is
 * what gives a kind a page row, an inspector and a tab strip. They join
 * by being added here — one list, so a kind cannot be routed through the
 * shell by the layout while a host still draws it a second page row.
 *
 * What the last three had before was one column with the viewer at the
 * top and everything else stacked under it, which is how a 190-page
 * archive ended up with 100px of viewer and 440px of metadata: the
 * viewer's height came from its own contents, so the more there was to
 * read the less of it was on screen. On the shell the viewer is the
 * canvas and the metadata is the inspector, and neither can push the
 * other.
 *
 * Not a `playerKind` question any more. That answers "which player
 * plays this", and a PDF has none — the two agreed only while the shell
 * was for media.
 */
function ridesShellAsViewer(
  fileType: string | undefined,
  mimeType: string | undefined,
): boolean {
  if (playerKind({ file_type: fileType, mime_type: mimeType }) !== null) {
    return true;
  }
  if (mimeType === "application/pdf") return true;
  return fileType === "archive" || fileType === "image";
}

/**
 * Mimes whose viewer gets a floor, named rather than matched.
 *
 * `startsWith("text/")` was the first spelling and it was two mistakes.
 * It is unreachable — plain text does not ride the shell at all, so the
 * branch never fired and the claim that a short text file gets a floor
 * was never true — and it was a trap for whoever makes it reachable:
 * `text/html` is also `text/`, and `text/html` is rendered in
 * `HtmlPreview`'s sandboxed iframe, which is exactly what the rule
 * below forbids putting a floor near.
 *
 * A prefix match answers "does this name look like the family I had in
 * mind", which is a guess. The list answers "is this one of the viewers
 * I have checked", which is the question that matters.
 */
const FLOORED_MIMES: ReadonlySet<string> = new Set(["application/pdf"]);

/**
 * Does this file's viewer get a floor under it in the canvas?
 *
 * An archive of seven entries drew a 200px band and left the rest of
 * the canvas empty. The viewer is what the page is for, and its height
 * came from how much happened to be inside it. A floor of 70% of the
 * canvas fixes that without capping anything — more content still grows
 * past it.
 *
 * **Archives and PDFs.** The floor is a fraction of a measured canvas
 * height, and the measurement is cheap; what is not cheap is what the
 * floor sits next to. A cross-origin iframe or a `<video>` under a
 * containment context renders its subtree rotated and spinning on iOS
 * Safari, and while the floor no longer establishes one, the two lists
 * are kept in step deliberately — this predicate is the place where
 * "which viewers have I actually looked at" is written down.
 *
 * Images are excluded for a different reason: `FilePreview` already
 * gives them `max-h-[70vh]`, so a floor would add white space around a
 * small photograph and nothing else.
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
 * Does this file's detail page ride `FileDetailShell` on this surface?
 *
 * The document half is surface-independent: a Markdown note has drawn
 * its own row on both surfaces since long before this, and taking that
 * away would be a regression rather than a scoping decision. The viewer
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
  return ridesShellAsViewer(args.fileType, args.mimeType);
}
