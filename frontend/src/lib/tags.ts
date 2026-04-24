/**
 * Unified tag-writing dispatcher for Litloft file detail surfaces.
 *
 * Why: under the β canonical rule (spec
 * ``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``
 * §D1), ``.md`` files treat frontmatter as the source of truth. Writing
 * directly to ``File.tags`` for a ``.md`` gets overwritten on the next
 * scanner pass. This module hides that split so UI code can just say
 * "save these tags for this file" and the right path is chosen.
 *
 * Callers should debounce — every Properties Panel chip edit triggers
 * a save. ``createDebouncedTagSaver`` packages the 2s window agreed in
 * §D7; tests use ``saveFileTags`` directly to skip the timer.
 */

import type { FileItem } from "@/types";
import { updateFileTags as updateFileTagsFlat } from "@/lib/api";
import {
  ConflictError,
  getFileTextContent,
  putFileTextContent,
} from "@/lib/fileContent";
import { extractValidTags, parseNote, withTags } from "@/lib/frontmatter";

export { ConflictError } from "@/lib/fileContent";

export const TAG_SAVE_DEBOUNCE_MS = 2000;

function isMarkdown(file: Pick<FileItem, "mime_type" | "filename">): boolean {
  if (file.mime_type === "text/markdown") return true;
  // Some seeds / older rows report "text/plain" for .md — lean on the
  // extension as the tiebreaker rather than rejecting user intent.
  return file.filename.toLowerCase().endsWith(".md");
}

/**
 * Write ``tags`` for ``file`` via the path that matches its type.
 *
 * - ``.md``: fetch current content, rewrite the frontmatter
 *   ``tags:``, PUT back with ``If-Match`` optimistic concurrency,
 *   then ping the knowledge resync endpoint so ``File.tags`` reflects
 *   the change without waiting for the scanner.
 * - Non-``.md``: PUT ``File.tags`` directly (existing API).
 *
 * Errors propagate to the caller. Expect ``ConflictError`` on
 * concurrent edits; other failures are generic ``Error``.
 */
export async function saveFileTags(
  file: Pick<FileItem, "id" | "mime_type" | "filename">,
  tags: string[]
): Promise<void> {
  // Filter here for symmetry with the .md path (which goes through
  // extractValidTags inside withTags). Without this, a caller that
  // forgot to pre-filter would get a 422 from core for non-.md files
  // instead of the silent-drop semantics the UI expects.
  const cleaned = extractValidTags({ tags });
  if (isMarkdown(file)) {
    await saveMarkdownTags(file.id, cleaned);
    return;
  }
  await updateFileTagsFlat(file.id, cleaned);
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function saveMarkdownTags(fileId: string, tags: string[]): Promise<void> {
  const { content, etag } = await getFileTextContent(fileId);
  // Compare against semantic tags rather than string-equality on the
  // rewritten body: gray-matter may reformat YAML on write (block vs
  // inline list, quoting changes) even when tags haven't semantically
  // changed. Without this check every "chip edit that ended up no-op"
  // would still eat a PUT and resync round-trip.
  const currentTags = extractValidTags(parseNote(content).metadata);
  const desired = extractValidTags({ tags });
  if (tagsEqual(currentTags, desired)) return;
  const next = withTags(content, tags);
  await putFileTextContent(fileId, next, etag);
  // Best-effort: the periodic scanner will also project tags within an
  // hour, so a failure here is not fatal. Logged for debugging.
  try {
    await fetch(
      `/api/addons/knowledge/resync-tags/${encodeURIComponent(fileId)}`,
      { method: "POST", credentials: "include" }
    );
  } catch (err) {
    if (typeof console !== "undefined") {
      // Log only the message — the raw Error object has a stack with
      // URL fragments that may embed path-sensitive metadata. The
      // content PUT succeeded; the scanner will converge.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("resync-tags trigger failed");
      console.warn(msg);
    }
  }
}

export interface DebouncedTagSaver {
  /** Queue a save; cancels any pending one with the same args. */
  schedule(tags: string[]): void;
  /** Fire any pending save now and await completion. */
  flush(): Promise<void>;
  /** Drop the pending save without firing it. */
  cancel(): void;
}

/**
 * Create a tag saver that coalesces rapid chip edits into a single
 * save after ``delayMs`` of inactivity. The returned object also
 * exposes ``flush`` for beforeunload / route-change hooks.
 *
 * Failure handling is delegated to the caller via ``onError``. The
 * saver is stateful and bound to a single file; if the caller
 * switches files it should ``cancel`` the old one and create a new.
 *
 * **React usage**: wrap the saver in a ``useMemo`` keyed on ``file.id``
 * and return ``saver.cancel`` from a ``useEffect`` cleanup. Forgetting
 * the cleanup lets a debounced save land after the component has
 * unmounted — harmless for the request itself (errors route through
 * ``onError``) but the resolved save touches a file the user has
 * already navigated away from.
 */
export function createDebouncedTagSaver(
  file: Pick<FileItem, "id" | "mime_type" | "filename">,
  opts: {
    onError?: (err: Error) => void;
    /**
     * Fires after a debounced save round-trip succeeds. Use this for
     * side effects that should reflect server state (e.g. refetching
     * a drive-wide tag list), not optimistic UI — ``onTagsChange``
     * on the component is still the place for immediate local
     * updates.
     */
    onSaveSuccess?: (tags: string[]) => void;
    delayMs?: number;
  } = {}
): DebouncedTagSaver {
  const delayMs = opts.delayMs ?? TAG_SAVE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingTags: string[] | null = null;
  let inflight: Promise<void> | null = null;

  async function run(tags: string[]): Promise<void> {
    try {
      await saveFileTags(file, tags);
      opts.onSaveSuccess?.(tags);
    } catch (err) {
      opts.onError?.(err as Error);
    }
  }

  return {
    schedule(tags: string[]) {
      pendingTags = tags;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const t = pendingTags ?? [];
        pendingTags = null;
        inflight = run(t);
      }, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        const t = pendingTags ?? [];
        pendingTags = null;
        inflight = run(t);
      }
      if (inflight) await inflight;
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingTags = null;
    },
  };
}
