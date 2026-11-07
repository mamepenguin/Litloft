export interface HighlightAnchor {
  quote: string;
  prefix: string;
  suffix: string;
}

export interface QuoteHit {
  start: number;
  end: number;
}

export interface NormalizedSource {
  /** Every whitespace run folded to one space, with the ends trimmed. */
  text: string;
  /** The UTF-16 start in the original text of each normalized character. */
  start: number[];
  /** The UTF-16 end in the original text of each normalized character. */
  end: number[];
}

const CONTEXT_CHARS = 32;

export function normalizeSource(text: string): NormalizedSource {
  const chars: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let previousSpace = false;

  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    if (/\s/u.test(char)) {
      if (!previousSpace) {
        chars.push(" ");
        start.push(index);
        end.push(index + char.length);
        previousSpace = true;
      } else {
        end[end.length - 1] = index + char.length;
      }
    } else {
      chars.push(char);
      start.push(index);
      end.push(index + char.length);
      previousSpace = false;
    }
    index += char.length;
  }

  if (chars[0] === " ") {
    chars.shift();
    start.shift();
    end.shift();
  }
  if (chars[chars.length - 1] === " ") {
    chars.pop();
    start.pop();
    end.pop();
  }

  return { text: chars.join(""), start, end };
}

export function normalize(text: string): string {
  return normalizeSource(text).text;
}

export function buildAnchor(
  text: string,
  startOffset: number,
  endOffset: number,
): HighlightAnchor {
  const start = Math.max(0, Math.min(startOffset, text.length));
  const end = Math.max(start, Math.min(endOffset, text.length));
  return {
    quote: normalize(text.slice(start, end)),
    prefix: normalize(text.slice(0, start)).slice(-CONTEXT_CHARS),
    suffix: normalize(text.slice(end)).slice(0, CONTEXT_CHARS),
  };
}

function commonSuffix(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function commonPrefix(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[length] === right[length]
  ) {
    length += 1;
  }
  return length;
}

export function findQuoteIn(
  source: NormalizedSource,
  anchor: HighlightAnchor,
): QuoteHit | null {
  const quote = normalize(anchor.quote);
  if (quote.length === 0) return null;

  const prefix = normalize(anchor.prefix);
  const suffix = normalize(anchor.suffix);

  let bestAt = -1;
  let bestScore = -1;
  for (
    let at = source.text.indexOf(quote);
    at >= 0;
    at = source.text.indexOf(quote, at + 1)
  ) {
    const before = source.text
      .slice(Math.max(0, at - prefix.length), at)
      .trimEnd();
    const after = source.text
      .slice(at + quote.length, at + quote.length + suffix.length)
      .trimStart();
    const score =
      commonSuffix(before, prefix) + commonPrefix(after, suffix);
    if (score > bestScore) {
      bestScore = score;
      bestAt = at;
    }
  }

  if (bestAt < 0) return null;
  const start = source.start[bestAt];
  const end = source.end[bestAt + quote.length - 1];
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

export function findQuote(
  text: string,
  anchor: HighlightAnchor,
): QuoteHit | null {
  return findQuoteIn(normalizeSource(text), anchor);
}
