/**
 * The list-row layout fixture's markup table, against the components it
 * copies.
 *
 * `e2e-layout/list-row-furniture.spec.ts` measures touch targets and a
 * name column in Chromium, and a browser suite can only see what the
 * markup in front of it produces. Here the markup *is* the measurement:
 * what the name gets is what is left of the row after its own padding,
 * the `w-24` thumbnail, the `gap-3` in front of the name, and the
 * trailing controls with whatever the row draws between and after them.
 * Drop any one of those from the fixture's table and it still reports a
 * width — of a row this app does not have.
 *
 * So this is the guard, and it is a parity test rather than one table read
 * twice: the fixture declares its markup as JSON inside the page, and
 * everything below comes from **rendering the component**.
 *
 * One render state is declared per row, by name, and each state's render
 * must equal its row — element, class list, attributes, descendant tree —
 * with the row names and the state names then compared as sets. Declared
 * per state rather than collected from the renders, for the reason
 * `relatedFilesFixtureParity.test.tsx` gives: an expectation built out of
 * the observation cannot catch a deletion, because the removed element
 * leaves both sides at once (`review-workflow.md`, detector rule 5).
 *
 * jsdom lays nothing out, so nothing here is evidence about a width, a
 * touch target or a gap. That is the browser spec's, and this is what
 * connects the two.
 */

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
 * The one shape with no component behind it: the file row exactly as it
 * was drawn before this change, kept so the browser spec can measure what
 * the change is worth rather than assert a sentence about it. Nothing
 * renders it, so nothing can be compared against — and it is named here
 * rather than filtered by a pattern, so adding a second unpinned shape has
 * to be a deliberate edit to this line.
 */
const COUNTERFACTUAL = "separated";

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

/**
 * The rendered element against its declared row, exactly.
 *
 * A node written without a `children` key is declared partially on purpose
 * and stops the walk — used for the lucide `<svg>`s, whose `<path>` data is
 * a drawing and moves no box, and for the `<img>`. Everything else is
 * exhaustive from there down, attributes included: a subset check is what
 * let a sibling fixture's table quietly drop `draggable`.
 *
 * An attribute value of `"*"` asks for presence only.
 *
 * `text` is not compared. It is the leaf's content — a date, a type label,
 * a filename — which is locale output rather than markup, and the widths
 * the browser spec asserts on are the column's rather than the string's.
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

const folder = { name: "Folder", path: "Folder", file_count: 3 } as Folder;

/**
 * One render per fixture row, declared by name.
 *
 * The three file states are the three answers this row gives about its
 * trailing furniture, and each is a real call site: a folder listing wires
 * both handlers, `CollectionDetail` and the right-hand pane wire the menu
 * without the star, and selection mode stands the menu down (the row means
 * "pick me" there, and right-click is already disabled for the same
 * reason). `selectable` is the state that keeps the row's trailing
 * padding, because it has no control whose own padding could stand in for
 * it.
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
    // `separated` has nothing to compare against, so what pins it is that
    // it differs from the shipped `file` row in exactly the three ways
    // this change made and in no other: the row's trailing padding, the
    // star's touch floor, and the group that holds the two controls.
    //
    // Without this the counterfactual could drift into any shape at all
    // and the browser spec would go on reporting a difference — about two
    // rows neither of which this app draws.
    const shipped = SHAPES.file;
    const before = SHAPES[COUNTERFACTUAL];

    const removed = tokens(shipped.class).filter(
      (c) => !tokens(before.class).includes(c),
    );
    expect(removed).toEqual(["pointer-coarse:pr-0"]);

    // The shipped row is link + group; the counterfactual is link + the
    // two controls the group held, in the same order.
    const group = shipped.children![1];
    expect(before.children!.map((c) => c.tag)).toEqual(["a", "button", "button"]);
    expect(group.children!.map((c) => c.tag)).toEqual(["button", "button"]);
    expect(before.children![0]).toEqual(shipped.children![0]);
    expect(before.children![2]).toEqual(group.children![1]);

    const star = group.children![0];
    const starBefore = before.children![1];
    expect(
      tokens(star.class).filter((c) => !tokens(starBefore.class).includes(c)),
    ).toEqual(["justify-center", "pointer-coarse:h-11", "pointer-coarse:w-11"]);
    expect(
      tokens(starBefore.class).filter((c) => !tokens(star.class).includes(c)),
    ).toEqual([]);
  });

  it("names the list column the fixture stacks the rows in", () => {
    // The fixture writes this class by hand. `FileList` is what draws it
    // around the rows in the app, and a column that stopped being a
    // block-level flex column would lay the rows out at their content
    // width — after which every width the spec reports is about a box the
    // app does not have, with nothing turning red.
    expect(FIXTURE_HTML).toContain('column.className = "flex flex-col"');
    const source = readFileSync(join(__dirname, "..", "FileList.tsx"), "utf8");
    expect(source).toContain('<div className="flex flex-col">');
  });
});
