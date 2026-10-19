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

export function withTags(content: string, newTags: string[]): string {
  const parsed = parseNote(content);
  const filtered = extractValidTags({ tags: newTags });
  const nextMeta = { ...parsed.metadata };
  // Belt-and-braces prototype pollution guard: js-yaml 4 defends by
  // default, but relying on dependency behaviour for a security
  // property is risky.
  delete (nextMeta as Record<string, unknown>)["__proto__"];
  delete nextMeta["constructor"];
  delete nextMeta["prototype"];

  if (filtered.length === 0) {
    if (!("tags" in nextMeta)) {
      return content;
    }
    delete nextMeta["tags"];
  } else {
    nextMeta["tags"] = filtered;
  }

  if (Object.keys(nextMeta).length === 0) {
    return parsed.body;
  }
  return matter.stringify(parsed.body, nextMeta);
}
