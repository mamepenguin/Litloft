import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { stripComments } from "./sourceScan";

/**
 * Finding a component handed from a Server Component to a Client one.
 *
 * Props cross that boundary by being serialised. A string, a number, a
 * plain object and a rendered `ReactNode` all survive it; a **function**
 * does not, and a React component is a function.
 *
 * A scanner rather than a rendered test, because the failure is invisible
 * to a rendered test by construction: `render(await Page())` is one
 * ordinary React tree, with no boundary in it and nothing to serialise.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * `"use client"`, wherever the directive really is.
 *
 * Comments are blanked first and the first non-blank line is read, with
 * no byte window: a module whose directive sits behind a long licence or
 * explanation comment is still a client module, and reading a fixed
 * prefix of raw text calls it a server one. That mistake is worse on a
 * *receiver* than on a source — a client component misread as a server
 * one makes every real leak into it invisible.
 */
export function isClientModule(text: string): boolean {
  const first = stripComments(text)
    .split("\n")
    .find((line) => line.trim().length > 0);
  return first !== undefined && /^["']use client["']/.test(first.trim());
}

/** Where an imported name comes from, for the `@/` and relative forms. */
export function importSources(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of text.matchAll(re)) {
    const [, clause, source] = m;
    for (const name of clause!.matchAll(/[A-Za-z_$][\w$]*/g)) {
      out.set(name[0], source!);
    }
  }
  return out;
}

export function resolveModule(fromFile: string, source: string): string | null {
  let base: string;
  if (source.startsWith("@/")) base = resolve(SRC, source.slice(2));
  else if (source.startsWith(".")) base = resolve(dirname(fromFile), source);
  else return null; // a package; not ours to classify
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const full = base + ext;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/** Components written in this very file, which are functions all the same. */
function localComponents(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(
    /(?:function\s+([A-Z][\w$]*)|(?:const|let|var)\s+([A-Z][\w$]*)\s*=)/g,
  )) {
    out.add((m[1] ?? m[2])!);
  }
  return out;
}

/**
 * The span of one JSX opening tag, from `<` to its own `>`.
 *
 * Found by counting brace depth and stepping over string and template
 * literals, **not** by a regex alternation over a single level of braces.
 * One level is not enough for real code: the shipped call site this
 * scanner exists to guard reads
 * `greeting={cond ? t("k", { name }) : undefined}`, and a one-level
 * pattern fails to match that element *as a whole* — so every prop on it,
 * including the leaking one beside it, went unexamined and the scan
 * reported the file clean.
 */
function openingTags(text: string): Array<{ tag: string; attrs: string }> {
  const out: Array<{ tag: string; attrs: string }> = [];
  const start = /<([A-Z][\w.]*)(?=[\s/>])/g;
  for (const m of text.matchAll(start)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    if (i < text.length) {
      out.push({ tag: m[1]!, attrs: text.slice(m.index! + m[0].length, i) });
    }
  }
  return out;
}

/**
 * `<Tag … prop={Value} …>` where `Tag` is a client component and `Value`
 * is a component — imported, or declared in this same file.
 *
 * Capitalised is JSX's own rule for "this is a component"; a lowercase
 * identifier is data. The brace has to hold nothing but the identifier,
 * so `scope={greeting}` and `title={t("x")}` are left alone.
 */
export function boundaryLeaks(
  text: string,
  file: string,
): Array<{ tag: string; prop: string; value: string }> {
  const stripped = stripComments(text);
  const imports = importSources(stripped);
  const locals = localComponents(stripped);
  const found: Array<{ tag: string; prop: string; value: string }> = [];
  for (const { tag, attrs } of openingTags(stripped)) {
    const tagSource = imports.get(tag.split(".")[0]!);
    if (!tagSource) continue;
    const tagFile = resolveModule(file, tagSource);
    if (!tagFile || !isClientModule(readFileSync(tagFile, "utf-8"))) continue;
    for (const attr of attrs.matchAll(
      /([A-Za-z_$][\w$]*)=\{\s*([A-Z][\w$]*)\s*\}/g,
    )) {
      const [, prop, value] = attr;
      if (imports.has(value!) || locals.has(value!)) {
        found.push({ tag, prop: prop!, value: value! });
      }
    }
  }
  return found;
}

/** Every module this one reaches through `@/` and relative imports. */
export function localImportsOf(file: string): string[] {
  const text = stripComments(readFileSync(file, "utf-8"));
  const out = new Set<string>();
  for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
    const resolved = resolveModule(file, m[1]!);
    if (resolved) out.add(resolved);
  }
  return [...out];
}
