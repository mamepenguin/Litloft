import type { FileKind } from "@/types";

export interface ParsedQuery {
  /** What is left to match names and paths against. */
  text: string;
  tags: string[];
  types: FileKind[];
  favorite: boolean;
  liked: boolean;
  hasOperators: boolean;
}

const KINDS: readonly FileKind[] = [
  "video",
  "image",
  "audio",
  "document",
  "archive",
  "other",
  "text",
  "pdf",
];

const OPERATOR = /^([^\s:：]+)[:：](.+)$/;

function kindOf(value: string): FileKind | null {
  const word = value.normalize("NFKC").toLowerCase();
  if (word === "markdown") return "text";
  return (KINDS as readonly string[]).includes(word) ? (word as FileKind) : null;
}

/**
 * `tag:` repeats as AND, `type:` as OR, `is:` takes `favorite` / `liked`.
 * A token that is not a recognised operator with a usable value is text.
 */
export function parseSearchQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = {
    text: "",
    tags: [],
    types: [],
    favorite: false,
    liked: false,
    hasOperators: false,
  };
  const words: string[] = [];

  for (const token of q.split(/\s+/).filter(Boolean)) {
    const match = OPERATOR.exec(token);
    const name = match?.[1].normalize("NFKC").toLowerCase();
    const value = match?.[2] ?? "";

    if (name === "tag") {
      if (!parsed.tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
        parsed.tags.push(value);
      }
      parsed.hasOperators = true;
      continue;
    }
    if (name === "type") {
      const kind = kindOf(value);
      if (kind) {
        if (!parsed.types.includes(kind)) parsed.types.push(kind);
        parsed.hasOperators = true;
        continue;
      }
    }
    if (name === "is") {
      const word = value.normalize("NFKC").toLowerCase();
      if (word === "favorite" || word === "liked") {
        parsed[word] = true;
        parsed.hasOperators = true;
        continue;
      }
    }
    words.push(token);
  }

  parsed.text = parsed.hasOperators ? words.join(" ") : q.trim();
  return parsed;
}

/** `document` is the one kind that holds others. */
function holds(outer: FileKind, inner: FileKind): boolean {
  return outer === inner || (outer === "document" && (inner === "text" || inner === "pdf"));
}

/**
 * A fixed kind (a scope, the search page's toolbar) narrowed by `type:`
 * operators. `impossible` means no file can match both, so nothing should be
 * requested.
 */
export function resolveKinds(
  fixed: FileKind | null,
  operators: readonly FileKind[],
): { kinds: FileKind[]; impossible: boolean } {
  if (operators.length === 0) return { kinds: fixed ? [fixed] : [], impossible: false };
  if (!fixed) return { kinds: [...operators], impossible: false };

  const kinds: FileKind[] = [];
  for (const kind of operators) {
    const both = holds(fixed, kind) ? kind : holds(kind, fixed) ? fixed : null;
    if (both && !kinds.includes(both)) kinds.push(both);
  }
  return { kinds, impossible: kinds.length === 0 };
}
