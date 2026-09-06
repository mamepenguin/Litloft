import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import {
  boundaryLeaks,
  isClientModule,
  localImportsOf,
} from "./helpers/serverClientBoundary";

/**
 * A Server Component may not hand a component to a Client Component.
 *
 * Props cross that boundary by being serialised, and a React component is
 * a function. The failure is invisible to this suite by construction: a
 * unit test renders `await Page()` as one ordinary React tree, where there
 * is no boundary and no serialisation, so `titleIcon={Warehouse}` passed
 * from `app/page.tsx` rendered green in all 5,393 tests and answered every
 * request in the running app with
 * "Functions cannot be passed directly to Client Components" — a 500 on
 * the home page. It was found by opening the page in a browser.
 *
 * The scan cannot see everything a boundary can carry wrongly. What it
 * covers, and what it does not, is written out in the cases below rather
 * than claimed in prose — an earlier draft's comment said it caught a
 * locally-declared component and it did not.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const APP = resolve(SRC, "app");

function tsxUnder(dir: string, skip: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (skip(entry.name)) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

const rel = (f: string) => relative(REPO_ROOT, f);

/**
 * `app/` is where a Server Component can live. Everything under
 * `components/` is reached from one of these, and a file there without
 * the directive is rendered inside a client parent — a premise the last
 * test in this file turns into a check rather than leaving as a comment.
 */
function serverComponentFiles(): string[] {
  return tsxUnder(APP, (n) => n === "__tests__" || n === "addons")
    .filter((f) => !isClientModule(readFileSync(f, "utf-8")))
    .sort();
}

describe("the server/client boundary carries no components", () => {
  const files = serverComponentFiles();

  // Exact, not a floor. A heuristic population that quietly shrank to
  // nothing would make every assertion below pass over an empty list,
  // and `page-headings.test.ts` argues the same case at length.
  it("scans exactly the server components this repository has", () => {
    expect(files.map(rel)).toEqual([
      "frontend/src/app/files/[id]/page.tsx",
      "frontend/src/app/layout.tsx",
      "frontend/src/app/page.tsx",
    ]);
  });

  it("hands no component to a client component", () => {
    const offenders = files.flatMap((f) =>
      boundaryLeaks(readFileSync(f, "utf-8"), f).map(
        (l) => `${rel(f)} — <${l.tag} ${l.prop}={${l.value}}>`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The premise that justifies scanning `app/` alone.
   *
   * A shared component without the directive is fine while it is only
   * ever rendered inside a client parent. It stops being fine the moment
   * a Server Component imports one, because then it is server code that
   * this scan does not read. Checked from this side rather than by
   * widening the walk, which would misread every client-rendered shared
   * component as a server one and need an exemption list.
   */
  it("reaches no server code outside app/", () => {
    const outside = files.flatMap((f) =>
      localImportsOf(f)
        .filter((imp) => /\.tsx$/.test(imp) && !imp.startsWith(APP))
        .filter((imp) => !isClientModule(readFileSync(imp, "utf-8")))
        .map((imp) => `${rel(f)} → ${rel(imp)}`),
    );
    expect(outside).toEqual([]);
  });
});

describe("the boundary scanner", () => {
  const pageFile = resolve(APP, "page.tsx");

  /**
   * The exact code that shipped the 500 — sitting beside the prop shape
   * it shipped *next to*.
   *
   * The first version of this scanner matched an element with a regex
   * that allowed one level of braces, and the greeting prop below holds
   * two (`t("greeting", { name })`). The element therefore never matched
   * at all, so the leak on the same tag went unread and the scan called
   * the file clean. Both props are in this fixture for that reason: the
   * failure was not in the attribute pattern, it was in finding the
   * element.
   */
  it("catches the one that got through, in the shape it got through in", () => {
    const original = `
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function Home({ nickname, t }) {
  return (
    <PageHeader
      titleIcon={Warehouse}
      title="Litloft"
      greeting={nickname ? t("greeting", { name: nickname }) : undefined}
    />
  );
}
`;
    expect(boundaryLeaks(original, pageFile)).toEqual([
      { tag: "PageHeader", prop: "titleIcon", value: "Warehouse" },
    ]);
  });

  it("catches a component declared in the same server module", () => {
    const local = `
import { PageHeader } from "@/components/PageHeader";

function LocalIcon() {
  return null;
}

export default function Home() {
  return <PageHeader titleIcon={LocalIcon} title="Litloft" />;
}
`;
    expect(boundaryLeaks(local, pageFile)).toEqual([
      { tag: "PageHeader", prop: "titleIcon", value: "LocalIcon" },
    ]);
  });

  it("leaves the values that do survive the boundary alone", () => {
    const fine = `
import { PageHeader } from "@/components/PageHeader";

export default function Home({ greeting }) {
  return (
    <PageHeader
      title="Litloft"
      scope={greeting}
      tabs={<span className={\`a-\${greeting}\`} />}
    />
  );
}
`;
    expect(boundaryLeaks(fine, pageFile)).toEqual([]);
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
    expect(boundaryLeaks(serverToServer, resolve(APP, "x.tsx"))).toEqual([]);
  });

  /**
   * The directive is found after comments are blanked, not inside a fixed
   * prefix of raw text. A client module misread as a server one is the
   * dangerous direction: every real leak *into* it stops being reported.
   */
  it("recognises a client module behind a long comment", () => {
    const behindProse = `${"// filler\n".repeat(40)}"use client";\n\nexport function X() {}\n`;
    expect(isClientModule(behindProse)).toBe(true);
    expect(isClientModule(`export function X() {}\n`)).toBe(false);
  });
});
