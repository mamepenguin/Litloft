import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  toggleFavorite: vi.fn(),
}));

import { FileListRow } from "../FileListRow";
import { FolderListRow } from "../FolderListRow";
import type { FileItemWithMatch, Folder } from "@/types";

afterEach(cleanup);

interface Markup {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  text?: string;
  children?: Markup[];
}

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "list-row-furniture.html",
);

const FIXTURE_HTML = readFileSync(FIXTURE, "utf8");

const SHAPES: Record<string, Markup> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/**
 * The one shape with no component behind it. Named here rather than
 * filtered by a pattern, so adding a second unpinned shape has to be a
 * deliberate edit to this line.
 */
const COUNTERFACTUAL = "separated";

/**
 * A `pointer-coarse:` utility, spelled so that this file is not itself a
 * Tailwind source for it: the fixture's stylesheet is compiled by scanning
 * everything under `frontend/`, so a class written whole here would make the
 * rule it asserts on impossible to be absent. The property and the value are
 * split too, or the argument is a source for the base utility.
 */
const coarse = ([property, value]: readonly [string, string]) =>
  `pointer-coarse:${property}-${value}`;

const PR_0 = ["pr", "0"] as const;
const GAP_0 = ["gap", "0"] as const;
const H_11 = ["h", "11"] as const;
const W_11 = ["w", "11"] as const;

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

/**
 * A node written without a `children` key is declared partially on purpose
 * and stops the walk. `text` is not compared: it is locale output rather
 * than markup.
 */
function expectMarkup(el: Element, spec: Markup, where: string) {
  expect(el.tagName.toLowerCase(), `${where}: element`).toBe(spec.tag);
  expect(classOf(el), `${where}: class`).toBe(normalise(spec.class));

  for (const [name, value] of Object.entries(spec.attrs ?? {})) {
    if (value === "*") {
      expect(el.hasAttribute(name), `${where}: missing [${name}]`).toBe(true);
    } else {
      expect(el.getAttribute(name), `${where}: [${name}]`).toBe(value);
    }
  }

  if (spec.children === undefined) return;

  expect(
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((name) => name !== "class")
      .sort(),
    `${where}: attributes`,
  ).toEqual(Object.keys(spec.attrs ?? {}).sort());

  const kids = Array.from(el.children);
  expect(kids, `${where}: children`).toHaveLength(spec.children.length);
  spec.children.forEach((child, i) => {
    expectMarkup(kids[i], child, `${where} > [${i}] ${child.tag}`);
  });
}

const file = {
  id: "f1",
  filename: "clip.mp4",
  title: "Title",
  description: "",
  drive: "d",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1024,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as FileItemWithMatch;

const folder: Folder = {
  name: "Folder",
  path: "Folder",
  file_count: 3,
  kind_counts: { video: 2, image: 1 },
  dominant_kind: "video",
};

/**
 * Each file state is a real call site: the props are the ones a caller
 * actually passes, not a combination the type allows.
 */
const STATES: Record<string, () => Element> = {
  file: () =>
    render(
      <FileListRow
        file={file}
        onContextMenu={vi.fn()}
        onFavoriteToggle={vi.fn()}
      />,
    ).container.firstElementChild!,
  fileNoStar: () =>
    render(<FileListRow file={file} onContextMenu={vi.fn()} />).container
      .firstElementChild!,
  selectable: () =>
    render(
      <FileListRow
        file={file}
        onContextMenu={vi.fn()}
        onFavoriteToggle={vi.fn()}
        selectable
        onSelect={vi.fn()}
      />,
    ).container.firstElementChild!,
  folder: () =>
    render(
      <FolderListRow folder={folder} driveName="d" onContextMenu={vi.fn()} />,
    ).container.firstElementChild!,
};

describe("the list-row layout fixture's markup table", () => {
  it("declares exactly the shapes the states below render, plus the counterfactual", () => {
    expect(Object.keys(SHAPES).sort()).toEqual(
      [...Object.keys(STATES), COUNTERFACTUAL].sort(),
    );
    expect(Object.keys(STATES).sort()).toEqual([
      "file",
      "fileNoStar",
      "folder",
      "selectable",
    ]);
  });

  for (const [name, renderState] of Object.entries(STATES)) {
    it(`matches the component's ${name} row`, () => {
      expectMarkup(renderState(), SHAPES[name], name);
    });
  }

  it("declares the counterfactual as the shipped row with three things put back", () => {
    const shipped = SHAPES.file;
    const before = SHAPES[COUNTERFACTUAL];

    const removed = tokens(shipped.class).filter(
      (c) => !tokens(before.class).includes(c),
    );
    expect(removed).toEqual([coarse(PR_0)]);
    expect(
      tokens(before.class).filter((c) => !tokens(shipped.class).includes(c)),
    ).toEqual([]);

    const group = shipped.children![1];
    expect(before.children!.map((c) => c.tag)).toEqual(["a", "button", "button"]);
    expect(group.children!.map((c) => c.tag)).toEqual(["button", "button"]);
    expect(before.children![0]).toEqual(shipped.children![0]);
    expect(before.children![2]).toEqual(group.children![1]);

    const star = group.children![0];
    const starBefore = before.children![1];
    expect(
      tokens(star.class).filter((c) => !tokens(starBefore.class).includes(c)),
    ).toEqual(["justify-center", coarse(H_11), coarse(W_11)]);
    expect(
      tokens(starBefore.class).filter((c) => !tokens(star.class).includes(c)),
    ).toEqual([]);

    expect(tokens(group.class)).toContain("gap-3");
    expect(tokens(group.class)).toContain(coarse(GAP_0));
    expect(tokens(shipped.class)).toContain("gap-3");
  });

  it("keeps the trailing padding on a row that draws no trailing control", () => {
    // No call site reaches this branch, but the props allow it, so the
    // guard is here rather than in the fixture.
    const row = render(
      <FileListRow file={file} selectable onSelect={vi.fn()} />,
    ).container.firstElementChild!;
    expect(tokens(classOf(row))).not.toContain(coarse(PR_0));
    expect(tokens(classOf(row))).toContain("p-2.5");
    expect(Array.from(row.children)).toHaveLength(1);
  });

  it("pins how the two containers the row kinds are stacked in are written", () => {
    // Both pins reach up to the statement that returns the column rather
    // than to its opening tag, because a bare tag survives being wrapped.
    // This does not hold the two `⋮` columns' alignment: an inset added by
    // a parent of either container passes it.
    expect(FIXTURE_HTML).toContain('column.className = "flex flex-col"');

    const fileList = readFileSync(join(__dirname, "..", "FileList.tsx"), "utf8");
    expect(fileList).toContain(
      'return (\n    <>\n      <div className="flex flex-col">',
    );

    const folderContent = readFileSync(
      join(__dirname, "..", "folder", "FolderContent.tsx"),
      "utf8",
    );
    expect(folderContent).toContain(
      'return <div className="mb-6">{children}</div>;',
    );
  });
});
