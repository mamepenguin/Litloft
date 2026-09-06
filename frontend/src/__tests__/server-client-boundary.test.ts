import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * A Server Component may not hand a component to a Client Component.
 *
 * Props cross that boundary by being serialised. A string, a number, a
 * plain object and a rendered `ReactNode` all survive it; a **function**
 * does not, and a React component is a function. The failure is invisible
 * to this test suite by construction: a unit test renders `await Page()`
 * as one ordinary React tree, where there is no boundary and no
 * serialisation, so `titleIcon={Warehouse}` passed from `app/page.tsx`
 * rendered green in all 5,393 tests and answered every request in the
 * running app with
 * "Functions cannot be passed directly to Client Components" — a 500 on
 * the home page. It was found by opening the page in a browser.
 *
 * Hence a source scan. It cannot see everything a boundary can carry
 * wrongly, but it sees this shape, which is the one that got through.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");

function isClientModule(text: string): boolean {
  return /^\s*["']use client["']/m.test(text.slice(0, 200));
}

/** Where an imported name comes from, for the `@/` and relative forms. */
function importSources(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of text.matchAll(re)) {
    const [, clause, source] = m;
    for (const name of clause.matchAll(/[A-Za-z_$][\w$]*/g)) {
      out.set(name[0], source);
    }
  }
  return out;
}

function resolveModule(fromFile: string, source: string): string | null {
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

function serverComponentFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || entry.name === "addons") continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        const text = readFileSync(full, "utf-8");
        if (!isClientModule(text)) out.push(full);
      }
    }
  };
  // `app/` is where Server Components live: everything else in the tree is
  // reached from one of these, and a non-"use client" file under
  // `components/` is only ever rendered inside a client parent.
  walk(resolve(SRC, "app"));
  return out;
}

/**
 * `<Tag … prop={Value} …>` where `Value` is an imported capitalised name.
 *
 * Capitalised because that is JSX's own rule for "this is a component":
 * a lowercase identifier is data. Imported because a name defined in the
 * same server module is the interesting case *and* the one this catches —
 * either way the value handed over is a function.
 */
export function boundaryLeaks(
  text: string,
  file: string,
): Array<{ tag: string; prop: string; value: string }> {
  const stripped = stripComments(text);
  const imports = importSources(stripped);
  const found: Array<{ tag: string; prop: string; value: string }> = [];
  for (const el of stripped.matchAll(/<([A-Z][\w.]*)((?:[^>"'{}]|\{[^{}]*\}|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const [, tag, attrs] = el;
    const tagSource = imports.get(tag.split(".")[0]!);
    if (!tagSource) continue;
    const tagFile = resolveModule(file, tagSource);
    if (!tagFile || !isClientModule(readFileSync(tagFile, "utf-8"))) continue;
    for (const attr of attrs.matchAll(/([A-Za-z_$][\w$]*)=\{([A-Z][\w$]*)\}/g)) {
      const [, prop, value] = attr;
      if (imports.has(value!)) found.push({ tag, prop: prop!, value: value! });
    }
  }
  return found;
}

describe("the server/client boundary carries no components", () => {
  const files = serverComponentFiles();

  it("has server components to check", () => {
    // "None of them leaks" is also true of an empty set, and this walk
    // depends on a heuristic ("no 'use client' at the top") that a
    // refactor could silently make match nothing.
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((f) => relative(REPO_ROOT, f))).toContain(
      "frontend/src/app/page.tsx",
    );
  });

  it("hands no imported component to a client component", () => {
    const offenders = files.flatMap((f) =>
      boundaryLeaks(readFileSync(f, "utf-8"), f).map(
        (l) => `${relative(REPO_ROOT, f)} — <${l.tag} ${l.prop}={${l.value}}>`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The detector, against the exact code that shipped the 500 — because
   * an empty offender list proves nothing about a scan that finds
   * nothing anywhere. `PageHeader` is a real client component and
   * `Warehouse` a real import, so this is the original line, not a
   * lookalike.
   */
  it("would have caught the one that got through", () => {
    const original = `
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function Home() {
  return <PageHeader titleIcon={Warehouse} title="Litloft" />;
}
`;
    expect(boundaryLeaks(original, resolve(SRC, "app/page.tsx"))).toEqual([
      { tag: "PageHeader", prop: "titleIcon", value: "Warehouse" },
    ]);
  });

  it("leaves the values that do survive the boundary alone", () => {
    const fine = `
import { PageHeader } from "@/components/PageHeader";

export default function Home() {
  const greeting = "hi";
  return <PageHeader title="Litloft" scope={greeting} tabs={<span />} />;
}
`;
    expect(boundaryLeaks(fine, resolve(SRC, "app/page.tsx"))).toEqual([]);
  });

  /**
   * A component handed to another *server* component never serialises,
   * so flagging it would be a false positive — and a detector that cries
   * about safe code gets an exemption list, which is how it stops being
   * read.
   */
  it("says nothing when the receiver is a server component", () => {
    const serverToServer = `
import { Warehouse } from "lucide-react";
import Home from "@/app/page";

export default function Wrapper() {
  return <Home titleIcon={Warehouse} />;
}
`;
    expect(boundaryLeaks(serverToServer, resolve(SRC, "app/x.tsx"))).toEqual([]);
  });
});
