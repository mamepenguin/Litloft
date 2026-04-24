/**
 * Frontmatter read/write helpers for ``.md`` files.
 *
 * ``gray-matter`` (already a core dep, used by MarkdownPreview) handles
 * the YAML parse. Serialisation uses ``matter.stringify`` with a
 * defensive fallback so we never write a subtly-different block than
 * we read — the scanner compares ``updated_at`` on the core side, so
 * spurious rewrites would trigger unnecessary re-projections.
 *
 * Spec ``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``
 * §D3: this is how the UI writes ``frontmatter.tags`` without touching
 * the body. Keep the validator mirror (TAG_RE, MAX_*) in sync with
 * core's ``TagUpdate`` and the knowledge scanner's ``_normalise_tags``.
 */

import matter from "gray-matter";

// Mirrors core's backend/app/schemas.py::TagUpdate.validate_tags and
// knowledge's _normalise_tags. Python's `re.UNICODE` makes ``\w``
// match CJK letters; JS ``\w`` stays ASCII-only even under the ``u``
// flag, so we spell the Unicode classes explicitly here
// (``\p{L}\p{N}_-``). Drift here means a tag that looks OK in the UI
// gets silently dropped server-side.
const TAG_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;

export interface ParsedNote {
  metadata: Record<string, unknown>;
  body: string;
}

/**
 * Parse a ``.md`` string into its frontmatter dict and body. Notes
 * without frontmatter return ``{metadata: {}, body: <full>}``.
 * Malformed YAML falls back to empty metadata so the caller can still
 * render the body. ``gray-matter`` is permissive — mirrors the server
 * side.
 */
export function parseNote(content: string): ParsedNote {
  try {
    const parsed = matter(content);
    return {
      metadata: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content ?? "",
    };
  } catch {
    return { metadata: {}, body: content };
  }
}

/**
 * Return the ``tags:`` list from frontmatter, filtered to core-valid
 * names. Mirrors the scanner's ``_normalise_tags`` so the UI never
 * displays a tag the server would reject.
 */
export function extractValidTags(metadata: Record<string, unknown>): string[] {
  const raw = metadata["tags"];
  if (!Array.isArray(raw)) return [];
  const capped = raw.slice(0, MAX_TAGS * 10);
  const seen = new Map<string, string>();
  for (const item of capped) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name || name.length > MAX_TAG_LEN) continue;
    if (!TAG_RE.test(name)) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
    if (seen.size >= MAX_TAGS) break;
  }
  return Array.from(seen.values());
}

/**
 * Rewrite a ``.md`` string so its ``frontmatter.tags`` equals
 * ``newTags``. Other metadata is preserved verbatim. An empty
 * ``newTags`` removes the ``tags:`` key entirely (YAML convention —
 * we prefer absence to ``tags: []`` so the file stays clean).
 *
 * When the note has no frontmatter at all and ``newTags`` is empty,
 * returns the original content unchanged.
 */
export function withTags(content: string, newTags: string[]): string {
  const parsed = parseNote(content);
  const filtered = extractValidTags({ tags: newTags });
  const nextMeta = { ...parsed.metadata };

  if (filtered.length === 0) {
    if (!("tags" in nextMeta)) {
      return content; // no-op: no frontmatter tags to clear
    }
    delete nextMeta["tags"];
  } else {
    nextMeta["tags"] = filtered;
  }

  // When the resulting metadata is empty we emit the body alone — no
  // stray "--- \n---" block. Otherwise gray-matter handles YAML dump.
  if (Object.keys(nextMeta).length === 0) {
    return parsed.body;
  }
  return matter.stringify(parsed.body, nextMeta);
}
