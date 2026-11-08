/**
 * SPEC-CORE-064: the repository half of the no-horizontal-scroll rule.
 *
 * The rule is enforced twice. This file reads the source tree for the
 * utilities and declarations that make a strip scroll sideways on a mouse,
 * and the Playwright spec `e2e-layout/no-horizontal-scroll.spec.ts` measures
 * the components in a browser. Neither can see what the other does: a class
 * list is not a layout, and a measured box does not say where the class came
 * from.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

import {
  findHscrollViolations,
  findMouseEnvironmentDefinitions,
  isFineHoverDefinition,
  type SourceFile,
} from "./hscrollScan";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDONS = resolve(REPO_ROOT, "addons");
const GLOBALS = resolve(SRC, "app/globals.css");

const SCAN_EXTENSIONS = /\.(?:tsx?|css)$/;
const TEST_FILE = /\.(?:test|spec)\.[^.]+$/;

/**
 * Addon checkouts are independent submodules. A directory with no `frontend`
 * is a pin that is not initialised, which is a skipped scan, not an empty
 * and therefore green one.
 */
function sourceRoots(): Array<{ label: string; root: string }> {
  const roots = [{ label: "frontend/src", root: SRC }];
  if (!existsSync(ADDONS)) return roots;
  for (const entry of readdirSync(ADDONS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = resolve(ADDONS, entry.name, "frontend");
    if (!existsSync(root)) continue;
    roots.push({ label: `addons/${entry.name}/frontend`, root });
  }
  return roots;
}

function walk(
  dir: string,
  visit: (file: string) => void,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "__tests__" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(full, visit);
    } else if (SCAN_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name)) {
      visit(full);
    }
  }
}

export function realSources(): SourceFile[] {
  const out: SourceFile[] = [];
  for (const { label, root } of sourceRoots()) {
    walk(root, (file) => {
      out.push({
        path:
          label === "frontend/src"
            ? `frontend/src/${relative(SRC, file)}`
            : `${label}/${relative(root, file)}`,
        body: readFileSync(file, "utf-8"),
      });
    });
  }
  return out;
}

const describeViolations = (violations: ReturnType<typeof findHscrollViolations>) =>
  violations.map((v) => `${v.path}:${v.line} ${v.text}`);

describe("SPEC-CORE-064 I8 — the scan itself", () => {
  const scan = (body: string, path = "frontend/src/example/Sample.tsx") =>
    findHscrollViolations([{ path, body }]);

  it.each([
    {
      why: "an unguarded strip",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="flex gap-3 overflow-x-auto pb-2" />;',
      violations: 1,
    },
    {
      why: "an unguarded scrolling strip",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="flex overflow-x-scroll" />;',
      violations: 1,
    },
    {
      why: "an unguarded snap axis",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="flex snap-x gap-3" />;',
      violations: 1,
    },
    {
      why: "a pointer-coarse guard on the same utility",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="flex pointer-coarse:overflow-x-auto" />;',
      violations: 0,
    },
    {
      why: "a pointer-coarse guard reached through another variant",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="flex md:pointer-coarse:snap-x" />;',
      violations: 0,
    },
    {
      why: "the exempt marker on the same element",
      path: "frontend/src/example/Sample.tsx",
      body: 'const snippet = <pre className="overflow-x-auto" data-hscroll-exempt />;',
      violations: 0,
    },
    {
      why: "the exempt marker on another line of the same element",
      path: "frontend/src/example/Sample.tsx",
      body: [
        "<pre",
        '  className="overflow-x-auto"',
        "  data-hscroll-exempt",
        "/>",
      ].join("\n"),
      violations: 0,
    },
    {
      why: "a guarded utility beside an unguarded one",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="pointer-coarse:snap-x overflow-x-auto" />;',
      violations: 1,
    },
    {
      why: "an unguarded css rule",
      path: "frontend/src/example/sample.css",
      body: ".strip { overflow-x: auto; }",
      violations: 1,
    },
    {
      why: "the markdown pre rule",
      path: "frontend/src/example/sample.css",
      body: ".markdown-body pre { overflow-x: auto; }",
      violations: 0,
    },
    {
      why: "the markdown table rule",
      path: "frontend/src/example/sample.css",
      body: ".markdown-body .markdown-table-scroll { overflow-x: scroll; }",
      violations: 0,
    },
    {
      why: "the markdown code block rule",
      path: "frontend/src/example/sample.css",
      body: ".markdown-body .code-block { overflow-x: auto; }",
      violations: 0,
    },
    {
      why: "the mermaid diagram rule",
      path: "frontend/src/example/sample.css",
      body: ".mermaid-diagram { overflow-x: auto; }",
      violations: 0,
    },
    {
      why: "a markdown rule beside an unexempt one",
      path: "frontend/src/example/sample.css",
      body: "@media (min-width: 1px) {\n  .strip { overflow-x: auto; }\n}",
      violations: 1,
    },
    {
      why: "a vertical scroller is not this rule",
      path: "frontend/src/example/Sample.tsx",
      body: 'const row = <ul className="overflow-y-auto overflow-auto" />;',
      violations: 0,
    },
  ])("$why: $violations violation(s)", ({ path, body, violations }) => {
    expect(scan(body, path)).toHaveLength(violations);
  });

  it("names the file and line of an offending utility", () => {
    const [violation] = scan(
      [
        "const row = (",
        '  <ul className="flex overflow-x-auto">',
        "    <li />",
        "  </ul>",
        ");",
      ].join("\n"),
    );

    expect(violation!.path).toBe("frontend/src/example/Sample.tsx");
    expect(violation!.line).toBe(2);
    expect(violation!.text).toBe("overflow-x-auto");
  });
});

describe("SPEC-CORE-064 I8 — the repository", () => {
  it("has no horizontal scroller without a touch-only guard or the exempt marker", () => {
    const files = realSources();
    // An empty walk would pass every case below and prove nothing.
    expect(files.length).toBeGreaterThan(100);
    expect(files.map((f) => f.path)).toContain(
      "frontend/src/components/appshell/ShelfBlock.tsx",
    );

    expect(describeViolations(findHscrollViolations(files))).toEqual([]);
  });
});

describe("SPEC-CORE-064 I9 — one definition of the mouse environment", () => {
  const definitions = findMouseEnvironmentDefinitions(realSources());

  it("defines the mouse variant as hover:hover and pointer:fine", () => {
    expect(definitions).toHaveLength(1);
    const [definition] = definitions;
    expect(definition!.path).toBe("frontend/src/app/globals.css");
    expect(definition!.kind).toBe("custom-variant");
    expect(isFineHoverDefinition(definition!.text)).toBe(true);
  });

  it("uses exactly the media query the rule names", () => {
    const globals = readFileSync(GLOBALS, "utf-8");
    expect(globals).toMatch(
      /@custom-variant\s+mouse\b[\s\S]{0,400}?\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)/,
    );
  });

  it("does not define the mouse environment anywhere else", () => {
    const elsewhere = definitions.filter(
      (definition) => definition.path !== "frontend/src/app/globals.css",
    );
    expect(elsewhere).toEqual([]);
  });

  it.each([
    {
      why: "a bare fine-pointer media rule",
      body: "@media (hover: hover) and (pointer: fine) { .x { display: block; } }",
      definitions: 1,
    },
    {
      why: "the custom variant in the spelling Tailwind accepts",
      body: "@custom-variant mouse (@media (hover: hover) and (pointer: fine));",
      definitions: 1,
    },
    {
      why: "a pointer-only variant",
      body: "@custom-variant pointer-fine (@media (pointer: fine));",
      definitions: 0,
    },
  ])("$why: $definitions definition(s)", ({ body, definitions: count }) => {
    expect(
      findMouseEnvironmentDefinitions([{ path: "styles.css", body }]),
    ).toHaveLength(count);
  });
});
