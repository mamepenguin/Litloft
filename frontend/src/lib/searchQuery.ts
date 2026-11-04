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

export const FILE_KINDS: readonly FileKind[] = [
  "video",
  "image",
  "audio",
  "document",
  "archive",
  "other",
  "text",
  "pdf",
];

const KINDS = FILE_KINDS;

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
export function kindHolds(outer: FileKind, inner: FileKind): boolean {
  return outer === inner || (outer === "document" && (inner === "text" || inner === "pdf"));
}

const holds = kindHolds;

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

export interface SearchFilter {
  tags: string[];
  kinds: FileKind[];
  favorite: boolean;
  liked: boolean;
}

/** The operators of a query as the meaning stage's `filter`. */
export function filterFromParsed(parsed: ParsedQuery, fixed: FileKind | null): SearchFilter {
  return {
    tags: [...parsed.tags],
    kinds: resolveKinds(fixed, parsed.types).kinds,
    favorite: parsed.favorite,
    liked: parsed.liked,
  };
}

/** The `filter` query parameter, with empty lists and false flags left out. */
export function filterQueryParam(filter: SearchFilter): string {
  return JSON.stringify({
    ...(filter.tags.length > 0 ? { tags: filter.tags } : {}),
    ...(filter.kinds.length > 0 ? { kinds: filter.kinds } : {}),
    ...(filter.favorite ? { favorite: true } : {}),
    ...(filter.liked ? { liked: true } : {}),
  });
}

export type OperatorChip =
  | { operator: "tag"; tag: string }
  | { operator: "type"; kind: FileKind }
  | { operator: "is"; flag: "favorite" | "liked" };

/** One chip per distinct operator, in the order the operators first appear. */
export function operatorChips(q: string): OperatorChip[] {
  const chips: OperatorChip[] = [];
  const seenTags = new Set<string>();
  const seenKinds = new Set<FileKind>();
  const seenFlags = new Set<string>();

  for (const token of q.split(/\s+/).filter(Boolean)) {
    const match = OPERATOR.exec(token);
    if (!match) continue;
    const name = match[1].normalize("NFKC").toLowerCase();
    const value = match[2];

    if (name === "tag") {
      const key = value.toLowerCase();
      if (seenTags.has(key)) continue;
      seenTags.add(key);
      chips.push({ operator: "tag", tag: value });
      continue;
    }
    if (name === "type") {
      const kind = kindOf(value);
      if (!kind || seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      chips.push({ operator: "type", kind });
      continue;
    }
    if (name === "is") {
      const flag = value.normalize("NFKC").toLowerCase();
      if ((flag !== "favorite" && flag !== "liked") || seenFlags.has(flag)) continue;
      seenFlags.add(flag);
      chips.push({ operator: "is", flag });
    }
  }
  return chips;
}

/**
 * Removes every token that produced `chip`, recognising operators exactly as
 * `parseSearchQuery` does; a token parsed as text is kept.
 */
export function removeOperatorChip(q: string, chip: OperatorChip): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const match = OPERATOR.exec(token);
      if (!match) return true;
      const name = match[1].normalize("NFKC").toLowerCase();
      const value = match[2];
      if (chip.operator === "tag") {
        return !(name === "tag" && value.toLowerCase() === chip.tag.toLowerCase());
      }
      if (chip.operator === "type") {
        return !(name === "type" && kindOf(value) === chip.kind);
      }
      return !(name === "is" && value.normalize("NFKC").toLowerCase() === chip.flag);
    })
    .join(" ");
}

export type ValueOperator = "tag" | "type" | "is";

export interface ActiveValue {
  operator: ValueOperator;
  /** What has been typed of the value so far. */
  partial: string;
  /** Where the token being typed starts in the query. */
  replaceFrom: number;
}

const PARTIAL = /^([^\s:：]+)[:：](\S*)$/;
const VALUE_OPERATORS: readonly ValueOperator[] = ["tag", "type", "is"];
const SUGGESTION_LIMIT = 8;

/** The operator whose value is being typed at the end of the query, if any. */
export function activeOperatorValue(q: string): ActiveValue | null {
  const replaceFrom = Math.max(q.lastIndexOf(" "), q.lastIndexOf("　"), q.lastIndexOf("\t")) + 1;
  const match = PARTIAL.exec(q.slice(replaceFrom));
  const name = match?.[1].normalize("NFKC").toLowerCase();
  if (!match || !VALUE_OPERATORS.includes(name as ValueOperator)) return null;
  return { operator: name as ValueOperator, partial: match[2], replaceFrom };
}

export function completeOperator(q: string, active: ActiveValue, value: string): string {
  return `${q.slice(0, active.replaceFrom)}${active.operator}:${value} `;
}

export interface ValueSuggestion {
  value: string;
  count?: number;
}

/** Prefix matches first, then substring matches; tags by count within each. */
export function suggestValues(
  active: ActiveValue,
  tags: readonly { name: string; count: number }[],
  usedTags: readonly string[],
): ValueSuggestion[] {
  const needle = active.partial.normalize("NFKC").toLowerCase();
  const rank = (word: string) => {
    const w = word.normalize("NFKC").toLowerCase();
    return w.startsWith(needle) ? 0 : w.includes(needle) ? 1 : -1;
  };
  const ranked = <T extends ValueSuggestion>(items: T[]) =>
    items
      .map((item) => ({ item, r: rank(item.value) }))
      .filter(({ r }) => r >= 0)
      .sort((a, b) => a.r - b.r || (b.item.count ?? 0) - (a.item.count ?? 0))
      .map(({ item }) => item)
      .slice(0, SUGGESTION_LIMIT);

  if (active.operator === "tag") {
    const used = new Set(usedTags.map((tag) => tag.toLowerCase()));
    return ranked(
      tags
        .filter((tag) => tag.count > 0 && !used.has(tag.name.toLowerCase()))
        .map((tag) => ({ value: tag.name, count: tag.count })),
    );
  }
  if (active.operator === "type") return ranked(KINDS.map((kind) => ({ value: kind })));
  return ranked([{ value: "favorite" }, { value: "liked" }]);
}
