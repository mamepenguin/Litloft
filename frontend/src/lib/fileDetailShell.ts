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
 * Safari, and while the floor no longer establishes one, this predicate
 * is now the **only** place where "which viewers have I actually looked
 * at" is written down — `ridesFileDetailShell` stopped being a list of
 * kinds, so nothing else carries that knowledge. A kind absent from
 * here rides the shell and gets no floor, which is the safe half: a
 * viewer that is a short panel keeps its own height, exactly as it did
 * on the old stack.
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
 * **On the canonical surface, every kind does.** The shell is what gives
 * a file a page row, an inspector and a tab strip, and "opening a file"
 * has one skeleton — that was the redesign's Phase 2 and this is the
 * rest of it.
 *
 * It used to be a list of kinds: media, then PDF, archives and images,
 * each added by name as it was looked at. What that produced was not a
 * decision about the kinds left out but a **fallthrough** — whatever
 * nobody had got to yet kept the old vertical stack, and the largest
 * group in it was not the Office files it was noticed on but
 * `text/plain`, which has a perfectly good viewer. A predicate whose
 * answer is "the ones somebody remembered" is a list that will be wrong
 * again the next time a mime is classified into a new kind.
 *
 * So the question is now the surface, and the kinds that are special are
 * named where they are actually special: `usesDocumentShell` for the
 * two that want the single-scroll document form, and
 * `viewerTakesCanvasFloor` for the two whose viewer gets a floor.
 *
 * The document half is surface-independent: a Markdown note has drawn
 * its own row on both surfaces since long before this, and taking that
 * away would be a regression rather than a scoping decision. Everything
 * else is canonical-only, per `FileDetailSurface` — the collection route
 * keeps its stack, deliberately, and that is the surface the
 * related-files list's second column is still measured on.
 *
 * `fileType` is read for one thing only, and it is not a kind test: it
 * is undefined exactly while the file has not resolved, and a file that
 * does not exist yet has no shell. Every kind that already rode the
 * shell answered "no" here during its fetch, so the new ones do too.
 * The one place that is observable is `FileDetailContainer`'s
 * `scrollRoot`, which reads this before the loading early-return —
 * "yes" would hand `useCompanionMetrics` a null root for the whole
 * fetch instead of the host's element. The hosts guard their own
 * loading state and never reach the branch.
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
