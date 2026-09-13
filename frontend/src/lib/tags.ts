/**
 * ``.md`` files treat frontmatter as the source of truth: writing
 * directly to ``File.tags`` for a ``.md`` gets overwritten on the next
 * scanner pass.
 *
 * The 500ms debounce: chip edits are punctuated user actions (Enter / ×
 * click), not streaming keystrokes. 500ms still coalesces typical
 * correction sequences (add → realise typo → remove → re-add) while
 * feeling immediate on LAN.
 */

import type { FileItem } from "@/types";
import { updateFileTags as updateFileTagsFlat } from "@/lib/api";
import {
  getFileTextContent,
  putFileTextContent,
} from "@/lib/fileContent";
import { extractValidTags, parseNote, withTags } from "@/lib/frontmatter";

export { ConflictError } from "@/lib/fileContent";

export const TAG_SAVE_DEBOUNCE_MS = 500;

function isMarkdown(file: Pick<FileItem, "mime_type" | "filename">): boolean {
  if (file.mime_type === "text/markdown") return true;
  // Some seeds / older rows report "text/plain" for .md — lean on the
  // extension as the tiebreaker rather than rejecting user intent.
  return file.filename.toLowerCase().endsWith(".md");
}

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
  // changed.
  const currentTags = extractValidTags(parseNote(content).metadata);
  const desired = extractValidTags({ tags });
  if (tagsEqual(currentTags, desired)) return;
  const next = withTags(content, tags);
  await putFileTextContent(fileId, next, etag);
}

export interface DebouncedTagSaver {
  schedule(tags: string[]): void;
  flush(): Promise<void>;
  cancel(): void;
}

/**
 * The saver is bound to a single file. In React, wrap it in a ``useMemo``
 * keyed on ``file.id`` and return ``saver.cancel`` from a ``useEffect``
 * cleanup; forgetting the cleanup lets a debounced save land after the
 * user has already navigated away from the file.
 */
export function createDebouncedTagSaver(
  file: Pick<FileItem, "id" | "mime_type" | "filename">,
  opts: {
    onError?: (err: Error) => void;
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
