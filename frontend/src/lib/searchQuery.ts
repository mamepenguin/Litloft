import type { FileKind } from "@/types";

export interface ParsedQuery {
  /** What is left to match names and paths against. */
  text: string;
  tags: string[];
  types: FileKind[];
  favorite: boolean;
  liked: boolean;
  folders: string[];
  collections: string[];
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

const WHITESPACE = /\s/;
const QUOTES = new Set(['"', "＂"]);

interface Token {
  /** The exact characters of the query the token spans. */
  raw: string;
  /** The name before the colon when the token has the name form. */
  name: string | null;
  /** The value after the colon, without quotes. */
  value: string;
  /** A quoted value was opened and never closed. */
  openQuote: boolean;
}

const MAX_FOLDERS = 10;
const MAX_FOLDER_CODE_POINTS = 1024;
const MAX_COLLECTIONS = 10;
const MAX_COLLECTION_CODE_POINTS = 100;

function codePoints(value: string): number {
  return [...value].length;
}

/**
 * Splits a query into raw tokens. Only a quote directly after the colon of a
 * name-form token opens a quoted value; anywhere else it is an ordinary
 * character.
 */
function tokenize(q: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < q.length) {
    if (WHITESPACE.test(q[i])) {
      i += 1;
      continue;
    }

    const start = i;
    let nameEnd = i;
    while (nameEnd < q.length) {
      const ch = q[nameEnd];
      if (WHITESPACE.test(ch) || ch === ":" || ch === "：") break;
      nameEnd += 1;
    }
    const atColon =
      nameEnd < q.length && (q[nameEnd] === ":" || q[nameEnd] === "：");

    if (atColon && nameEnd > start && nameEnd + 1 < q.length) {
      const valueStart = nameEnd + 1;
      if (QUOTES.has(q[valueStart])) {
        let close = valueStart + 1;
        while (close < q.length && !QUOTES.has(q[close])) close += 1;
        const closed = close < q.length;
        const end = closed ? close + 1 : q.length;
        tokens.push({
          raw: q.slice(start, end),
          name: q.slice(start, nameEnd),
          value: q.slice(valueStart + 1, closed ? close : q.length),
          openQuote: !closed,
        });
        i = end;
        continue;
      }

      let end = valueStart;
      while (end < q.length && !WHITESPACE.test(q[end])) end += 1;
      tokens.push({
        raw: q.slice(start, end),
        name: q.slice(start, nameEnd),
        value: q.slice(valueStart, end),
        openQuote: false,
      });
      i = end;
      continue;
    }

    let end = start;
    while (end < q.length && !WHITESPACE.test(q[end])) end += 1;
    tokens.push({ raw: q.slice(start, end), name: null, value: "", openQuote: false });
    i = end;
  }

  return tokens;
}

function kindOf(value: string): FileKind | null {
  const word = value.normalize("NFKC").toLowerCase();
  if (word === "markdown") return "text";
  return (KINDS as readonly string[]).includes(word) ? (word as FileKind) : null;
}

function normaliseFolder(value: string): string | null {
  const folder = value.normalize("NFC").replace(/^\/+|\/+$/g, "");
  if (!folder || folder.includes("\u0000")) return null;
  if (folder.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  if (codePoints(folder) > MAX_FOLDER_CODE_POINTS) return null;
  return folder;
}

function normaliseCollection(value: string): string | null {
  const name = value.trim();
  if (!name || codePoints(name) > MAX_COLLECTION_CODE_POINTS) return null;
  return name;
}

type AcceptedOperator =
  | { operator: "tag"; tag: string }
  | { operator: "type"; kind: FileKind }
  | { operator: "is"; flag: "favorite" | "liked" }
  | { operator: "path"; folder: string }
  | { operator: "collection"; collection: string };

interface InterpretedToken {
  raw: string;
  accepted: AcceptedOperator | null;
  openQuote: boolean;
}

/**
 * The one reading of a query shared by parsing, chips and removal. A token
 * that is not a recognised operator with a usable value is text.
 */
function interpret(q: string): InterpretedToken[] {
  const folders: string[] = [];
  const collections: string[] = [];

  return tokenize(q).map((token) => {
    const text = (): InterpretedToken => ({
      raw: token.raw,
      accepted: null,
      openQuote: token.openQuote,
    });
    if (token.name === null || token.value === "") return text();

    const name = token.name.normalize("NFKC").toLowerCase();
    if (name === "tag") {
      return {
        raw: token.raw,
        accepted: { operator: "tag", tag: token.value },
        openQuote: token.openQuote,
      };
    }
    if (name === "type") {
      const kind = kindOf(token.value);
      if (!kind) return text();
      return {
        raw: token.raw,
        accepted: { operator: "type", kind },
        openQuote: token.openQuote,
      };
    }
    if (name === "is") {
      const word = token.value.normalize("NFKC").toLowerCase();
      if (word !== "favorite" && word !== "liked") return text();
      return {
        raw: token.raw,
        accepted: { operator: "is", flag: word },
        openQuote: token.openQuote,
      };
    }
    if (name === "path") {
      const folder = normaliseFolder(token.value);
      if (folder === null) return text();
      const accepted: AcceptedOperator = { operator: "path", folder };
      if (folders.includes(folder) || folders.length < MAX_FOLDERS) {
        if (!folders.includes(folder)) folders.push(folder);
        return { raw: token.raw, accepted, openQuote: token.openQuote };
      }
      return text();
    }
    if (name === "in") {
      const collection = normaliseCollection(token.value);
      if (collection === null) return text();
      const key = collection.toLowerCase();
      const accepted: AcceptedOperator = { operator: "collection", collection };
      if (
        collections.some((existing) => existing.toLowerCase() === key) ||
        collections.length < MAX_COLLECTIONS
      ) {
        if (!collections.some((existing) => existing.toLowerCase() === key)) {
          collections.push(collection);
        }
        return { raw: token.raw, accepted, openQuote: token.openQuote };
      }
      return text();
    }
    return text();
  });
}

/**
 * `tag:` repeats as AND, `type:` as OR, `is:` takes `favorite` / `liked`,
 * `path:` and `in:` narrow the drive. A token that is not a recognised
 * operator with a usable value is text.
 */
export function parseSearchQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = {
    text: "",
    tags: [],
    types: [],
    favorite: false,
    liked: false,
    folders: [],
    collections: [],
    hasOperators: false,
  };
  const words: string[] = [];

  for (const { raw, accepted } of interpret(q)) {
    if (!accepted) {
      words.push(raw);
      continue;
    }
    parsed.hasOperators = true;
    if (accepted.operator === "tag") {
      if (!parsed.tags.some((tag) => tag.toLowerCase() === accepted.tag.toLowerCase())) {
        parsed.tags.push(accepted.tag);
      }
    } else if (accepted.operator === "type") {
      if (!parsed.types.includes(accepted.kind)) parsed.types.push(accepted.kind);
    } else if (accepted.operator === "is") {
      parsed[accepted.flag] = true;
    } else if (accepted.operator === "path") {
      if (!parsed.folders.includes(accepted.folder)) parsed.folders.push(accepted.folder);
    } else if (
      !parsed.collections.some(
        (collection) => collection.toLowerCase() === accepted.collection.toLowerCase(),
      )
    ) {
      parsed.collections.push(accepted.collection);
    }
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
  folders: string[];
  collections: string[];
}

/** The operators of a query as the meaning stage's `filter`. */
export function filterFromParsed(parsed: ParsedQuery, fixed: FileKind | null): SearchFilter {
  return {
    tags: [...parsed.tags],
    kinds: resolveKinds(fixed, parsed.types).kinds,
    favorite: parsed.favorite,
    liked: parsed.liked,
    folders: [...parsed.folders],
    collections: [...parsed.collections],
  };
}

/** The `filter` query parameter, with empty lists and false flags left out. */
export function filterQueryParam(filter: SearchFilter): string {
  return JSON.stringify({
    ...(filter.tags.length > 0 ? { tags: filter.tags } : {}),
    ...(filter.kinds.length > 0 ? { kinds: filter.kinds } : {}),
    ...(filter.favorite ? { favorite: true } : {}),
    ...(filter.liked ? { liked: true } : {}),
    ...(filter.folders.length > 0 ? { folders: filter.folders } : {}),
    ...(filter.collections.length > 0 ? { collections: filter.collections } : {}),
  });
}

export type OperatorChip =
  | { operator: "tag"; tag: string }
  | { operator: "type"; kind: FileKind }
  | { operator: "is"; flag: "favorite" | "liked" }
  | { operator: "path"; folder: string }
  | { operator: "collection"; collection: string };

/** One chip per distinct operator, in the order the operators first appear. */
export function operatorChips(q: string): OperatorChip[] {
  const chips: OperatorChip[] = [];
  const seenTags = new Set<string>();
  const seenKinds = new Set<FileKind>();
  const seenFlags = new Set<string>();
  const seenFolders = new Set<string>();
  const seenCollections = new Set<string>();

  for (const { accepted } of interpret(q)) {
    if (!accepted) continue;
    if (accepted.operator === "tag") {
      const key = accepted.tag.toLowerCase();
      if (seenTags.has(key)) continue;
      seenTags.add(key);
      chips.push({ operator: "tag", tag: accepted.tag });
      continue;
    }
    if (accepted.operator === "type") {
      if (seenKinds.has(accepted.kind)) continue;
      seenKinds.add(accepted.kind);
      chips.push({ operator: "type", kind: accepted.kind });
      continue;
    }
    if (accepted.operator === "is") {
      if (seenFlags.has(accepted.flag)) continue;
      seenFlags.add(accepted.flag);
      chips.push({ operator: "is", flag: accepted.flag });
      continue;
    }
    if (accepted.operator === "path") {
      if (seenFolders.has(accepted.folder)) continue;
      seenFolders.add(accepted.folder);
      chips.push({ operator: "path", folder: accepted.folder });
      continue;
    }
    const key = accepted.collection.toLowerCase();
    if (seenCollections.has(key)) continue;
    seenCollections.add(key);
    chips.push({ operator: "collection", collection: accepted.collection });
  }
  return chips;
}

function chipMatches(accepted: AcceptedOperator | null, chip: OperatorChip): boolean {
  if (!accepted) return false;
  if (chip.operator === "tag") {
    return accepted.operator === "tag" && accepted.tag.toLowerCase() === chip.tag.toLowerCase();
  }
  if (chip.operator === "type") {
    return accepted.operator === "type" && accepted.kind === chip.kind;
  }
  if (chip.operator === "is") {
    return accepted.operator === "is" && accepted.flag === chip.flag;
  }
  if (chip.operator === "path") {
    return accepted.operator === "path" && accepted.folder === chip.folder;
  }
  return (
    accepted.operator === "collection" &&
    accepted.collection.toLowerCase() === chip.collection.toLowerCase()
  );
}

/**
 * Removes every token that produced `chip`, recognising operators exactly as
 * `parseSearchQuery` does; a token parsed as text is kept.
 */
export function removeOperatorChip(q: string, chip: OperatorChip): string {
  return interpret(q)
    .filter(({ accepted }) => !chipMatches(accepted, chip))
    .map(({ raw }) => raw)
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
  const tokens = tokenize(q);
  if (tokens[tokens.length - 1]?.openQuote) return null;

  const replaceFrom = Math.max(q.lastIndexOf(" "), q.lastIndexOf("　"), q.lastIndexOf("\t")) + 1;
  const match = PARTIAL.exec(q.slice(replaceFrom));
  const name = match?.[1].normalize("NFKC").toLowerCase();
  if (!match || !VALUE_OPERATORS.includes(name as ValueOperator)) return null;
  return { operator: name as ValueOperator, partial: match[2], replaceFrom };
}

export function formatOperatorToken(operator: string, value: string): string {
  return `${operator}:${WHITESPACE.test(value) ? `"${value}"` : value}`;
}

export function completeOperator(q: string, active: ActiveValue, value: string): string {
  return `${q.slice(0, active.replaceFrom)}${formatOperatorToken(active.operator, value)} `;
}

/** Appends the closing quote when the query ends inside an open quoted value. */
export function closeOpenQuote(q: string): string {
  const tokens = tokenize(q);
  return tokens[tokens.length - 1]?.openQuote ? `${q}"` : q;
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
