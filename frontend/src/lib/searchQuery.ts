import type { FileKind } from "@/types";

export type ComparisonOperator = "gt" | "gte" | "lt" | "lte";

/** One comparison of a `size:`, `duration:` or resolved `modified:` token. */
export interface Comparison {
  operator: ComparisonOperator;
  value: number;
}

/**
 * The amount of a `modified:` token: a calendar period read in the evaluation
 * zone, or a fixed length counted back from the moment the query is evaluated.
 */
export type ModifiedUnit = "d" | "w" | "m" | "y";

export type ModifiedAmount =
  | {
      kind: "absolute";
      year: number;
      /** `null` for a whole year. */
      month: number | null;
      /** `null` for a whole month or year. */
      day: number | null;
    }
  | {
      kind: "relative";
      count: number;
      unit: ModifiedUnit;
      seconds: number;
    };

/** One `modified:` token, before it is resolved against `now` and a zone. */
export interface ModifiedToken {
  /** The comparison as written. */
  operator: ComparisonOperator;
  amount: ModifiedAmount;
  /** The canonical form that tells two spellings of one token apart. */
  identity: string;
  /** The value as first written, after NFKC and whitespace removal. */
  value: string;
}

export interface ParsedQuery {
  /** What is left to match names and paths against. */
  text: string;
  tags: string[];
  types: FileKind[];
  kinds: FileKind[];
  favorite: boolean;
  liked: boolean;
  folders: string[];
  collections: string[];
  sizes: Comparison[];
  durations: Comparison[];
  /**
   * `modified:` tokens in order of first appearance; absent when the query
   * names no `modified:` token at all.
   */
  modified?: ModifiedToken[];
  /** The values of `-tag:`, in order of first appearance. */
  excludedTags: string[];
  excludedTypes: FileKind[];
  excludedFolders: string[];
  excludedCollections: string[];
  notFavorite: boolean;
  notLiked: boolean;
  hasTag: boolean;
  noTag: boolean;
  hasCollection: boolean;
  noCollection: boolean;
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
  "epub",
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
const MAX_EXCLUDED_KINDS = 8;
const NEGATABLE_OPERATORS = new Set(["tag", "type", "path", "in", "is", "has"]);
const MAX_RANGE_COMPARISONS = 4;
const MAX_SIZE_BYTES = BigInt(2) ** BigInt(53) - BigInt(1);
const MAX_DURATION_MILLIS = 10_000_000_000;

const COMPARISON_PREFIX = /^(>=|<=|>|<)(.*)$/;
const COMPARISON_OPERATORS: Record<string, ComparisonOperator> = {
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};
const SIZE_UNITS: Record<string, number> = {
  "": 1,
  B: 1,
  K: 1024,
  KB: 1024,
  M: 1024 ** 2,
  MB: 1024 ** 2,
  G: 1024 ** 3,
  GB: 1024 ** 3,
  T: 1024 ** 4,
  TB: 1024 ** 4,
};
const DURATION_UNITS: Record<string, number> = { h: 3600, m: 60, s: 1 };
const SIZE_AMOUNT = /^(\d+)(?:\.(\d+))?([A-Za-z]*)$/;
const NUMBER_WITH_UNIT = /(\d+(?:\.\d+)?)([hms])/gi;
const CLOCK = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/;
const MODIFIED_ABSOLUTE = /^(\d{4})(?:([-/])(\d{1,2})(?:\2(\d{1,2}))?)?$/;
const MODIFIED_RELATIVE = /^([1-9]\d*)([dwmy])$/i;
const MODIFIED_RELATIVE_DAYS: Record<string, number> = {
  d: 1,
  w: 7,
  m: 30,
  y: 365,
};
const MAX_MODIFIED_DAYS = 36_500;
/** The wire range of `modified_at`: 1970-01-01T00:00:00Z to 9999-12-31T23:59:59Z. */
const MAX_MODIFIED_SECONDS = 253_402_300_799;
const SECONDS_PER_DAY = 86_400;
const COMPARISON_PREFIXES: Record<ComparisonOperator, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

function splitDecimal(text: string): { digits: bigint; places: number } {
  const [whole, fraction = ""] = text.split(".");
  return { digits: BigInt(whole + fraction), places: fraction.length };
}

/** Rounds a non-negative rational to an integer, halves away from zero. */
function roundToInteger(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
}

function parseSizeAmount(amount: string): number | null {
  const match = SIZE_AMOUNT.exec(amount);
  if (!match) return null;
  const [, whole, fraction = "", unit] = match;
  const multiplier = SIZE_UNITS[unit.toUpperCase()];
  if (multiplier === undefined) return null;
  const { digits, places } = splitDecimal(whole + (fraction ? `.${fraction}` : ""));
  const bytes = roundToInteger(
    digits * BigInt(multiplier),
    BigInt(10) ** BigInt(places),
  );
  if (bytes > MAX_SIZE_BYTES) return null;
  return Number(bytes);
}

function durationParts(amount: string): { numerator: bigint; denominator: bigint } | null {
  if (/^\d+(?:\.\d+)?$/.test(amount)) {
    const { digits, places } = splitDecimal(amount);
    return { numerator: digits, denominator: BigInt(10) ** BigInt(places) };
  }

  const clock = CLOCK.exec(amount);
  if (clock) {
    const [, first, second, third] = clock;
    const seconds = third === undefined
      ? Number(first) * 60 + Number(second)
      : Number(first) * 3600 + Number(second) * 60 + Number(third);
    return { numerator: BigInt(seconds), denominator: BigInt(1) };
  }

  const parts: { digits: bigint; places: number; order: number }[] = [];
  let cursor = 0;
  NUMBER_WITH_UNIT.lastIndex = 0;
  for (let match = NUMBER_WITH_UNIT.exec(amount); match; match = NUMBER_WITH_UNIT.exec(amount)) {
    if (match.index !== cursor) return null;
    cursor = match.index + match[0].length;
    const order = ["h", "m", "s"].indexOf(match[2].toLowerCase());
    parts.push({ ...splitDecimal(match[1]), order });
  }
  if (cursor !== amount.length || parts.length === 0) return null;

  let maxPlaces = 0;
  for (const part of parts) maxPlaces = Math.max(maxPlaces, part.places);
  let numerator = BigInt(0);
  let previousOrder = -1;
  for (const part of parts) {
    if (part.order <= previousOrder) return null;
    previousOrder = part.order;
    const unit = DURATION_UNITS[["h", "m", "s"][part.order]];
    numerator +=
      part.digits * BigInt(unit) * BigInt(10) ** BigInt(maxPlaces - part.places);
  }
  return { numerator, denominator: BigInt(10) ** BigInt(maxPlaces) };
}

function parseDurationAmount(amount: string): number | null {
  const parts = durationParts(amount);
  if (!parts) return null;
  const millis = roundToInteger(parts.numerator * BigInt(1000), parts.denominator);
  if (millis > BigInt(MAX_DURATION_MILLIS)) return null;
  return Number(millis) / 1000;
}

function parseComparison(kind: "size" | "duration", value: string): Comparison | null {
  const match = COMPARISON_PREFIX.exec(value);
  if (!match) return null;
  const [, prefix, amount] = match;
  const number = kind === "size"
    ? parseSizeAmount(amount)
    : parseDurationAmount(amount);
  if (number === null) return null;
  return { operator: COMPARISON_OPERATORS[prefix], value: number };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseModifiedAmount(value: string): ModifiedAmount | null {
  const absolute = MODIFIED_ABSOLUTE.exec(value);
  if (absolute) {
    const [, yearText, , monthText, dayText] = absolute;
    const year = Number(yearText);
    if (year < 1970 || year > 9999) return null;
    if (monthText === undefined) {
      return { kind: "absolute", year, month: null, day: null };
    }
    const month = Number(monthText);
    if (month < 1 || month > 12) return null;
    if (dayText === undefined) {
      return { kind: "absolute", year, month, day: null };
    }
    const day = Number(dayText);
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { kind: "absolute", year, month, day };
  }

  const relative = MODIFIED_RELATIVE.exec(value);
  if (!relative) return null;
  const count = Number(relative[1]);
  const unit = relative[2].toLowerCase() as ModifiedUnit;
  const days = count * MODIFIED_RELATIVE_DAYS[unit];
  if (days > MAX_MODIFIED_DAYS) return null;
  return { kind: "relative", count, unit, seconds: days * SECONDS_PER_DAY };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function modifiedIdentity(
  operator: ComparisonOperator,
  amount: ModifiedAmount,
): string {
  const prefix = COMPARISON_PREFIXES[operator];
  if (amount.kind === "relative") {
    return `${prefix}${amount.count}${amount.unit}`;
  }
  const month = amount.month === null ? "" : `-${pad2(amount.month)}`;
  const day = amount.day === null ? "" : `-${pad2(amount.day)}`;
  return `${prefix}${amount.year}${month}${day}`;
}

function parseModified(value: string): ModifiedToken | null {
  const match = COMPARISON_PREFIX.exec(value);
  if (!match) return null;
  const [, prefix, amountText] = match;
  const amount = parseModifiedAmount(amountText);
  if (amount === null) return null;
  const operator = COMPARISON_OPERATORS[prefix];
  return { operator, amount, identity: modifiedIdentity(operator, amount), value };
}

export function comparisonWireForm(comparison: Comparison): string {
  const value = Number.isInteger(comparison.value)
    ? String(comparison.value)
    : comparison.value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${comparison.operator}:${value}`;
}

function sameComparison(a: Comparison, b: Comparison): boolean {
  return a.operator === b.operator && a.value === b.value;
}

const ZONE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = ZONE_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONE_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether `timeZone` is an IANA zone `Intl` knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The offset of `timeZone` from UTC at that instant, in milliseconds. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const values: Record<string, number> = {};
  for (const { type, value } of zoneFormatter(timeZone).formatToParts(new Date(utcMs))) {
    if (type !== "literal") values[type] = Number(value);
  }
  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour ?? 0,
      values.minute ?? 0,
      values.second ?? 0,
    ) - utcMs
  );
}

/**
 * The epoch second of local midnight on a calendar date. Without a zone the
 * browser's own zone is used, which is also what `new Date(y, m, d)` means.
 */
function localMidnightSeconds(
  year: number,
  month: number,
  day: number,
  timeZone: string | null,
): number {
  if (timeZone === null) {
    return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
  }
  const utcGuess = Date.UTC(year, month - 1, day);
  const offset = zoneOffsetMs(utcGuess, timeZone);
  let instant = utcGuess - offset;
  // A daylight-saving switch between the guess and the answer moves the
  // offset; the second pass lands on the wall clock that was asked for.
  const settled = zoneOffsetMs(instant, timeZone);
  if (settled !== offset) instant = utcGuess - settled;
  return Math.floor(instant / 1000);
}

function clampModifiedSeconds(value: number): number {
  return Math.min(MAX_MODIFIED_SECONDS, Math.max(0, value));
}

function periodEnd(amount: Extract<ModifiedAmount, { kind: "absolute" }>): {
  year: number;
  month: number;
  day: number;
} {
  if (amount.day !== null) {
    const next = new Date(Date.UTC(amount.year, (amount.month as number) - 1, amount.day + 1));
    return {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
    };
  }
  if (amount.month !== null) {
    return amount.month === 12
      ? { year: amount.year + 1, month: 1, day: 1 }
      : { year: amount.year, month: amount.month + 1, day: 1 };
  }
  return { year: amount.year + 1, month: 1, day: 1 };
}

function resolveModifiedToken(
  token: ModifiedToken,
  nowSeconds: number,
  timeZone: string | null,
): Comparison {
  const { amount } = token;
  if (amount.kind === "relative") {
    return {
      operator: token.operator,
      value: clampModifiedSeconds(nowSeconds - amount.seconds),
    };
  }
  const start = clampModifiedSeconds(
    localMidnightSeconds(
      amount.year,
      amount.month ?? 1,
      amount.day ?? 1,
      timeZone,
    ),
  );
  const end = periodEnd(amount);
  const endSeconds = clampModifiedSeconds(
    localMidnightSeconds(end.year, end.month, end.day, timeZone),
  );
  // `<=P` ends at the period's next midnight, so it is the same comparison as
  // `<` the next period; `>P` starts there.
  if (token.operator === "lt") return { operator: "lt", value: start };
  if (token.operator === "gte") return { operator: "gte", value: start };
  if (token.operator === "lte") return { operator: "lt", value: endSeconds };
  return { operator: "gte", value: endSeconds };
}

export interface ResolvedModified {
  /** The run's comparisons, one per distinct comparison. */
  comparisons: Comparison[];
  /** The distinct wire forms, in token order. */
  wireForms: string[];
  /** Whether any token names an absolute period. */
  hasAbsolute: boolean;
}

/**
 * Resolves a query's `modified:` tokens against one instant and one zone.
 * Absolute dates are read as calendar periods in `timeZone` (the browser's
 * zone when absent); relative amounts count fixed lengths back from `now`.
 */
export function resolveModified(
  parsed: ParsedQuery,
  now: Date | number,
  timeZone: string | null = null,
): ResolvedModified {
  const nowSeconds = Math.floor(
    (typeof now === "number" ? now : now.getTime()) / 1000,
  );
  const comparisons: Comparison[] = [];
  const wireForms: string[] = [];
  let hasAbsolute = false;
  for (const token of parsed.modified ?? []) {
    const comparison = resolveModifiedToken(token, nowSeconds, timeZone);
    if (!comparisons.some((held) => sameComparison(held, comparison))) {
      comparisons.push(comparison);
    }
    const wire = comparisonWireForm(comparison);
    if (!wireForms.includes(wire)) wireForms.push(wire);
    if (token.amount.kind === "absolute") hasAbsolute = true;
  }
  return { comparisons, wireForms, hasAbsolute };
}

/** True when comparisons of one kind admit no value. */
export function comparisonsImpossible(
  comparisons: readonly Comparison[],
  kind: "size" | "duration" | "modified",
): boolean {
  if (kind !== "duration") {
    let low = 0;
    let high = Number.POSITIVE_INFINITY;
    for (const { operator, value } of comparisons) {
      if (operator === "gt") low = Math.max(low, value + 1);
      else if (operator === "gte") low = Math.max(low, value);
      else if (operator === "lt") high = Math.min(high, value - 1);
      else high = Math.min(high, value);
    }
    return high < low;
  }

  let lowest = 0;
  let lowestInclusive = true;
  let highest = Number.POSITIVE_INFINITY;
  let highestInclusive = true;
  const narrow = (
    bound: number,
    inclusive: boolean,
    lower: boolean,
  ): void => {
    if (lower) {
      if (bound > lowest || (bound === lowest && !inclusive)) {
        lowest = bound;
        lowestInclusive = inclusive;
      }
    } else if (bound < highest || (bound === highest && !inclusive)) {
      highest = bound;
      highestInclusive = inclusive;
    }
  };
  for (const { operator, value } of comparisons) {
    if (operator === "gt") narrow(value, false, true);
    else if (operator === "gte") narrow(value, true, true);
    else if (operator === "lt") narrow(value, false, false);
    else narrow(value, true, false);
  }
  if (highest < lowest) return true;
  return highest === lowest && !(lowestInclusive && highestInclusive);
}

/** True when one of a parsed query's operator ranges admits no value. */
export function hasImpossibleRange(
  parsed: ParsedQuery,
  modified: readonly Comparison[] = [],
): boolean {
  return (
    comparisonsImpossible(parsed.sizes, "size") ||
    comparisonsImpossible(parsed.durations, "duration") ||
    comparisonsImpossible(modified, "modified")
  );
}

/**
 * True when the query's own conditions contradict each other, so no file can
 * pass all of them. `fixed` is the page's kind, which the exclusions narrow.
 */
export function hasImpossibleConditions(
  parsed: ParsedQuery,
  fixed: FileKind | null = null,
): boolean {
  const excludedTags = new Set(parsed.excludedTags.map((tag) => tag.toLowerCase()));
  if (parsed.tags.some((tag) => excludedTags.has(tag.toLowerCase()))) return true;
  if (parsed.noTag && (parsed.tags.length > 0 || parsed.hasTag)) return true;
  if (parsed.favorite && parsed.notFavorite) return true;
  if (parsed.liked && parsed.notLiked) return true;
  if (parsed.hasCollection && parsed.noCollection) return true;

  const kinds = resolveKinds(fixed, parsed.types).kinds;
  if (
    kinds.length > 0 &&
    kinds.every((kind) => parsed.excludedTypes.some((excluded) => kindHolds(excluded, kind)))
  ) {
    return true;
  }

  if (
    parsed.folders.length > 0 &&
    parsed.folders.every((folder) =>
      parsed.excludedFolders.some(
        (excluded) => folder === excluded || folder.startsWith(`${excluded}/`),
      ),
    )
  ) {
    return true;
  }

  return (
    parsed.collections.length > 0 &&
    parsed.collections.every((name) =>
      parsed.excludedCollections.some(
        (excluded) => excluded.toLowerCase() === name.toLowerCase(),
      ),
    )
  );
}

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

type AcceptedOperator = { negated: boolean } & (
  | { operator: "tag"; tag: string }
  | { operator: "type"; kind: FileKind }
  | { operator: "is"; flag: "favorite" | "liked" }
  | { operator: "path"; folder: string }
  | { operator: "collection"; collection: string }
  | { operator: "has"; value: "tag" | "collection" }
  | { operator: "size"; comparison: Comparison; value: string }
  | { operator: "duration"; comparison: Comparison; value: string }
  | { operator: "modified"; token: ModifiedToken }
);

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
  const excludedFolders: string[] = [];
  const excludedCollections: string[] = [];
  const excludedTypes: FileKind[] = [];
  const sizes: string[] = [];
  const durations: string[] = [];
  const modifieds: string[] = [];

  return tokenize(q).map((token) => {
    const text = (): InterpretedToken => ({
      raw: token.raw,
      accepted: null,
      openQuote: token.openQuote,
    });
    if (token.name === null || token.value === "") return text();

    const written = token.name.normalize("NFKC").toLowerCase();
    const negated = written.startsWith("-") && !written.startsWith("--");
    const name = negated ? written.slice(1) : written;
    if (negated && !NEGATABLE_OPERATORS.has(name)) return text();

    if (name === "tag") {
      return {
        raw: token.raw,
        accepted: { operator: "tag", tag: token.value, negated },
        openQuote: token.openQuote,
      };
    }
    if (name === "type") {
      const kind = kindOf(token.value);
      if (!kind) return text();
      if (negated) {
        if (!excludedTypes.includes(kind) && excludedTypes.length >= MAX_EXCLUDED_KINDS) {
          return text();
        }
        if (!excludedTypes.includes(kind)) excludedTypes.push(kind);
      }
      return {
        raw: token.raw,
        accepted: { operator: "type", kind, negated },
        openQuote: token.openQuote,
      };
    }
    if (name === "is") {
      const word = token.value.normalize("NFKC").toLowerCase();
      if (word !== "favorite" && word !== "liked") return text();
      return {
        raw: token.raw,
        accepted: { operator: "is", flag: word, negated },
        openQuote: token.openQuote,
      };
    }
    if (name === "has") {
      const value = token.value.normalize("NFKC").toLowerCase();
      if (value !== "tag" && value !== "collection") return text();
      return {
        raw: token.raw,
        accepted: { operator: "has", value, negated },
        openQuote: token.openQuote,
      };
    }
    if (name === "path") {
      const folder = normaliseFolder(token.value);
      if (folder === null) return text();
      const bucket = negated ? excludedFolders : folders;
      const accepted: AcceptedOperator = { operator: "path", folder, negated };
      if (bucket.includes(folder) || bucket.length < MAX_FOLDERS) {
        if (!bucket.includes(folder)) bucket.push(folder);
        return { raw: token.raw, accepted, openQuote: token.openQuote };
      }
      return text();
    }
    if (name === "in") {
      const collection = normaliseCollection(token.value);
      if (collection === null) return text();
      const bucket = negated ? excludedCollections : collections;
      const key = collection.toLowerCase();
      const accepted: AcceptedOperator = { operator: "collection", collection, negated };
      if (
        bucket.some((existing) => existing.toLowerCase() === key) ||
        bucket.length < MAX_COLLECTIONS
      ) {
        if (!bucket.some((existing) => existing.toLowerCase() === key)) {
          bucket.push(collection);
        }
        return { raw: token.raw, accepted, openQuote: token.openQuote };
      }
      return text();
    }
    if (name === "size" || name === "duration") {
      const value = token.value.normalize("NFKC").replace(/\s+/g, "");
      const comparison = parseComparison(name, value);
      if (comparison === null) return text();
      const bucket = name === "size" ? sizes : durations;
      const key = comparisonWireForm(comparison);
      if (bucket.includes(key)) {
        return {
          raw: token.raw,
          accepted: { operator: name, comparison, value, negated: false },
          openQuote: token.openQuote,
        };
      }
      if (bucket.length >= MAX_RANGE_COMPARISONS) return text();
      bucket.push(key);
      return {
        raw: token.raw,
        accepted: { operator: name, comparison, value, negated: false },
        openQuote: token.openQuote,
      };
    }
    if (name === "modified") {
      const value = token.value.normalize("NFKC").replace(/\s+/g, "");
      const modified = parseModified(value);
      if (modified === null) return text();
      const accepted: AcceptedOperator = { operator: "modified", token: modified, negated: false };
      if (modifieds.includes(modified.identity)) {
        return { raw: token.raw, accepted, openQuote: token.openQuote };
      }
      if (modifieds.length >= MAX_RANGE_COMPARISONS) return text();
      modifieds.push(modified.identity);
      return { raw: token.raw, accepted, openQuote: token.openQuote };
    }
    return text();
  });
}

/**
 * `tag:` repeats as AND, `type:` as OR, `is:` takes `favorite` / `liked`,
 * `path:` and `in:` narrow the drive, and each of them with a leading `-`
 * excludes. `has:` takes `tag` or `collection`. A token that is not a
 * recognised operator with a usable value is text.
 */
export function parseSearchQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = {
    text: "",
    tags: [],
    types: [],
    get kinds() {
      return this.types;
    },
    favorite: false,
    liked: false,
    folders: [],
    collections: [],
    sizes: [],
    durations: [],
    excludedTags: [],
    excludedTypes: [],
    excludedFolders: [],
    excludedCollections: [],
    notFavorite: false,
    notLiked: false,
    hasTag: false,
    noTag: false,
    hasCollection: false,
    noCollection: false,
    hasOperators: false,
  };
  const words: string[] = [];

  const mentionsModified = tokenize(q).some(
    (token) => token.name?.normalize("NFKC").toLowerCase() === "modified",
  );
  if (mentionsModified) parsed.modified = [];

  for (const { raw, accepted } of interpret(q)) {
    if (!accepted) {
      words.push(raw);
      continue;
    }
    parsed.hasOperators = true;
    if (accepted.operator === "tag") {
      const list = accepted.negated ? parsed.excludedTags : parsed.tags;
      if (!list.some((tag) => tag.toLowerCase() === accepted.tag.toLowerCase())) {
        list.push(accepted.tag);
      }
    } else if (accepted.operator === "type") {
      const list = accepted.negated ? parsed.excludedTypes : parsed.types;
      if (!list.includes(accepted.kind)) list.push(accepted.kind);
    } else if (accepted.operator === "is") {
      if (accepted.negated) {
        if (accepted.flag === "favorite") parsed.notFavorite = true;
        else parsed.notLiked = true;
      } else {
        parsed[accepted.flag] = true;
      }
    } else if (accepted.operator === "has") {
      if (accepted.value === "tag") parsed[accepted.negated ? "noTag" : "hasTag"] = true;
      else parsed[accepted.negated ? "noCollection" : "hasCollection"] = true;
    } else if (accepted.operator === "path") {
      const list = accepted.negated ? parsed.excludedFolders : parsed.folders;
      if (!list.includes(accepted.folder)) list.push(accepted.folder);
    } else if (accepted.operator === "size") {
      if (!parsed.sizes.some((held) => sameComparison(held, accepted.comparison))) {
        parsed.sizes.push(accepted.comparison);
      }
    } else if (accepted.operator === "duration") {
      if (!parsed.durations.some((held) => sameComparison(held, accepted.comparison))) {
        parsed.durations.push(accepted.comparison);
      }
    } else if (accepted.operator === "modified") {
      const tokens = parsed.modified as ModifiedToken[];
      if (!tokens.some((held) => held.identity === accepted.token.identity)) {
        tokens.push(accepted.token);
      }
    } else {
      const list = accepted.negated ? parsed.excludedCollections : parsed.collections;
      if (!list.some((collection) => collection.toLowerCase() === accepted.collection.toLowerCase())) {
        list.push(accepted.collection);
      }
    }
  }

  parsed.text = parsed.hasOperators ? words.join(" ") : q.trim();
  return parsed;
}

/** Whether the query holds a negated operator or a `has:` token. */
export function hasNewToken(parsed: ParsedQuery): boolean {
  return (
    parsed.excludedTags.length > 0 ||
    parsed.excludedTypes.length > 0 ||
    parsed.excludedFolders.length > 0 ||
    parsed.excludedCollections.length > 0 ||
    parsed.notFavorite ||
    parsed.notLiked ||
    parsed.hasTag ||
    parsed.noTag ||
    parsed.hasCollection ||
    parsed.noCollection
  );
}

/** `document` is the one kind that holds others. */
export function kindHolds(outer: FileKind, inner: FileKind): boolean {
  return (
    outer === inner ||
    (outer === "document" && (inner === "text" || inner === "pdf" || inner === "epub"))
  );
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
  /** `false` excludes favorites; `null` leaves the question open. */
  favorite: boolean | null;
  liked: boolean | null;
  folders: string[];
  collections: string[];
  sizes: string[];
  durations: string[];
  /** The resolved wire forms; absent when the query holds no `modified:`. */
  modified?: string[];
  exclude_tags: string[];
  exclude_kinds: FileKind[];
  exclude_folders: string[];
  exclude_collections: string[];
  has_tag: boolean | null;
  has_collection: boolean | null;
}

/** The operators of a query as the meaning stage's `filter`. */
export function filterFromParsed(
  parsed: ParsedQuery,
  fixed: FileKind | null,
  modified: readonly string[] = [],
): SearchFilter {
  return {
    tags: [...parsed.tags],
    kinds: resolveKinds(fixed, parsed.types).kinds,
    favorite: parsed.favorite ? true : parsed.notFavorite ? false : null,
    liked: parsed.liked ? true : parsed.notLiked ? false : null,
    folders: [...parsed.folders],
    collections: [...parsed.collections],
    sizes: parsed.sizes.map(comparisonWireForm),
    durations: parsed.durations.map(comparisonWireForm),
    ...(modified.length > 0 ? { modified: [...modified] } : {}),
    exclude_tags: [...parsed.excludedTags],
    exclude_kinds: [...parsed.excludedTypes],
    exclude_folders: [...parsed.excludedFolders],
    exclude_collections: [...parsed.excludedCollections],
    has_tag: parsed.hasTag ? true : parsed.noTag ? false : null,
    has_collection: parsed.hasCollection ? true : parsed.noCollection ? false : null,
  };
}

/** The `filter` query parameter, with empty lists and unset flags left out. */
export function filterQueryParam(filter: SearchFilter): string {
  return JSON.stringify({
    ...(filter.tags.length > 0 ? { tags: filter.tags } : {}),
    ...(filter.kinds.length > 0 ? { kinds: filter.kinds } : {}),
    ...(filter.favorite === true ? { favorite: true } : filter.favorite === false ? { favorite: false } : {}),
    ...(filter.liked === true ? { liked: true } : filter.liked === false ? { liked: false } : {}),
    ...(filter.folders.length > 0 ? { folders: filter.folders } : {}),
    ...(filter.collections.length > 0 ? { collections: filter.collections } : {}),
    ...(filter.sizes.length > 0 ? { sizes: filter.sizes } : {}),
    ...(filter.durations.length > 0 ? { durations: filter.durations } : {}),
    ...(filter.modified && filter.modified.length > 0
      ? { modified: filter.modified }
      : {}),
    ...(filter.exclude_tags.length > 0 ? { exclude_tags: filter.exclude_tags } : {}),
    ...(filter.exclude_kinds.length > 0 ? { exclude_kinds: filter.exclude_kinds } : {}),
    ...(filter.exclude_folders.length > 0 ? { exclude_folders: filter.exclude_folders } : {}),
    ...(filter.exclude_collections.length > 0
      ? { exclude_collections: filter.exclude_collections }
      : {}),
    ...(filter.has_tag !== null ? { has_tag: filter.has_tag } : {}),
    ...(filter.has_collection !== null ? { has_collection: filter.has_collection } : {}),
  });
}

export type OperatorChip =
  | { operator: "tag"; tag: string; negated?: boolean }
  | { operator: "type"; kind: FileKind; negated?: boolean }
  | { operator: "is"; flag: "favorite" | "liked"; negated?: boolean }
  | { operator: "path"; folder: string; negated?: boolean }
  | { operator: "collection"; collection: string; negated?: boolean }
  | { operator: "has"; value: "tag" | "collection"; negated?: boolean }
  | { operator: "size"; value: string; comparison: Comparison }
  | { operator: "duration"; value: string; comparison: Comparison }
  | { operator: "modified"; value: string; token: ModifiedToken };

function polarity(negated: boolean): string {
  return negated ? "-" : "+";
}

/** One chip per distinct operator, value and polarity, in order of first appearance. */
export function operatorChips(q: string): OperatorChip[] {
  const chips: OperatorChip[] = [];
  const seen = new Set<string>();

  for (const { accepted } of interpret(q)) {
    if (!accepted) continue;
    const side = polarity(accepted.negated);
    if (accepted.operator === "tag") {
      const key = `${side}tag:${accepted.tag.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ operator: "tag", tag: accepted.tag, ...(accepted.negated ? { negated: true } : {}) });
      continue;
    }
    if (accepted.operator === "type") {
      const key = `${side}type:${accepted.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ operator: "type", kind: accepted.kind, ...(accepted.negated ? { negated: true } : {}) });
      continue;
    }
    if (accepted.operator === "is") {
      const key = `${side}is:${accepted.flag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ operator: "is", flag: accepted.flag, ...(accepted.negated ? { negated: true } : {}) });
      continue;
    }
    if (accepted.operator === "has") {
      const key = `${side}has:${accepted.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ operator: "has", value: accepted.value, ...(accepted.negated ? { negated: true } : {}) });
      continue;
    }
    if (accepted.operator === "path") {
      const key = `${side}path:${accepted.folder}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ operator: "path", folder: accepted.folder, ...(accepted.negated ? { negated: true } : {}) });
      continue;
    }
    if (accepted.operator === "size" || accepted.operator === "duration") {
      const key = `${side}${accepted.operator}:${comparisonWireForm(accepted.comparison)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({
        operator: accepted.operator,
        value: accepted.value,
        comparison: accepted.comparison,
      });
      continue;
    }
    if (accepted.operator === "modified") {
      const key = `${side}modified:${accepted.token.identity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({
        operator: "modified",
        value: accepted.token.value,
        token: accepted.token,
      });
      continue;
    }
    const key = `${side}collection:${accepted.collection.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({
      operator: "collection",
      collection: accepted.collection,
      ...(accepted.negated ? { negated: true } : {}),
    });
  }
  return chips;
}

function samePolarity(accepted: AcceptedOperator, chip: OperatorChip): boolean {
  return accepted.negated === (("negated" in chip && chip.negated) === true);
}

function chipMatches(accepted: AcceptedOperator | null, chip: OperatorChip): boolean {
  if (!accepted || !samePolarity(accepted, chip)) return false;
  if (chip.operator === "tag") {
    return accepted.operator === "tag" && accepted.tag.toLowerCase() === chip.tag.toLowerCase();
  }
  if (chip.operator === "type") {
    return accepted.operator === "type" && accepted.kind === chip.kind;
  }
  if (chip.operator === "is") {
    return accepted.operator === "is" && accepted.flag === chip.flag;
  }
  if (chip.operator === "has") {
    return accepted.operator === "has" && accepted.value === chip.value;
  }
  if (chip.operator === "path") {
    return accepted.operator === "path" && accepted.folder === chip.folder;
  }
  if (chip.operator === "size" || chip.operator === "duration") {
    return (
      accepted.operator === chip.operator &&
      sameComparison(accepted.comparison, chip.comparison)
    );
  }
  if (chip.operator === "modified") {
    return (
      accepted.operator === "modified" &&
      accepted.token.identity === chip.token.identity
    );
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

export type ValueOperator = "tag" | "type" | "is" | "has";

export interface ActiveValue {
  operator: ValueOperator;
  /** The token being typed carries a leading `-`. */
  negated?: boolean;
  /** What has been typed of the value so far. */
  partial: string;
  /** Where the token being typed starts in the query. */
  replaceFrom: number;
  /** The values the same operator already holds in either polarity. */
  held?: string[];
}

const PARTIAL = /^([^\s:：]+)[:：](\S*)$/;
const VALUE_OPERATORS: readonly ValueOperator[] = ["tag", "type", "is", "has"];
const SUGGESTION_LIMIT = 8;

/** The values an operator already holds, in either polarity, before a token. */
function heldValues(operator: ValueOperator, q: string): string[] {
  const parsed = parseSearchQuery(q);
  if (operator === "tag") return [...parsed.tags, ...parsed.excludedTags];
  if (operator === "has") {
    return [
      ...(parsed.hasTag || parsed.noTag ? ["tag"] : []),
      ...(parsed.hasCollection || parsed.noCollection ? ["collection"] : []),
    ];
  }
  return [];
}

/** The operator whose value is being typed at the end of the query, if any. */
export function activeOperatorValue(q: string): ActiveValue | null {
  const tokens = tokenize(q);
  if (tokens[tokens.length - 1]?.openQuote) return null;

  const replaceFrom = Math.max(q.lastIndexOf(" "), q.lastIndexOf("　"), q.lastIndexOf("\t")) + 1;
  const match = PARTIAL.exec(q.slice(replaceFrom));
  if (!match) return null;
  const written = match[1].normalize("NFKC").toLowerCase();
  const negated = written.startsWith("-") && !written.startsWith("--");
  const name = negated ? written.slice(1) : written;
  if (!VALUE_OPERATORS.includes(name as ValueOperator)) return null;
  const operator = name as ValueOperator;
  const held = heldValues(operator, q.slice(0, replaceFrom));
  return {
    operator,
    ...(negated ? { negated: true } : {}),
    partial: match[2],
    replaceFrom,
    ...(held.length > 0 ? { held } : {}),
  };
}

export function formatOperatorToken(operator: string, value: string): string {
  return `${operator}:${WHITESPACE.test(value) ? `"${value}"` : value}`;
}

export function completeOperator(q: string, active: ActiveValue, value: string): string {
  const operator = `${active.negated ? "-" : ""}${active.operator}`;
  return `${q.slice(0, active.replaceFrom)}${formatOperatorToken(operator, value)} `;
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

  const held = new Set(
    [...usedTags, ...(active.held ?? [])].map((value) => value.toLowerCase()),
  );

  if (active.operator === "has") {
    return ranked(
      ["tag", "collection"]
        .filter((value) => !held.has(value))
        .map((value) => ({ value })),
    );
  }
  if (active.operator === "tag") {
    return ranked(
      tags
        .filter((tag) => tag.count > 0 && !held.has(tag.name.toLowerCase()))
        .map((tag) => ({ value: tag.name, count: tag.count })),
    );
  }
  if (active.operator === "type") return ranked(KINDS.map((kind) => ({ value: kind })));
  return ranked([{ value: "favorite" }, { value: "liked" }]);
}
