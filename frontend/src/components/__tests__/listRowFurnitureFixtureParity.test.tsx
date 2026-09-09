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
 * connects the two — the rows, and also the containers they are stacked
 * in, since the fixture draws one column where the app draws two side by
 * side and a spec that measured one column cannot see the other move.
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

/**
 * A `pointer-coarse:` utility, spelled so that this file is not itself a
 * source for it.
 *
 * `e2e-layout/build-fixture-css.ts` compiles the fixture's stylesheet by
 * scanning everything under `frontend/` — this file included — and then
 * asserts that particular rules came out of it. A class written whole in an
 * assertion here is therefore enough on its own to make Tailwind emit the
 * rule, after which that needle can never be absent: "a needle that cannot be
 * absent asserts nothing", in that file's own words. Measured: with the
 * trailing-padding class taken out of `rowFurniture.ts` and out of the
 * fixture, the sheet still carried `.pointer-coarse\:pr-0` and `globalSetup`
 * did not throw, purely because of the assertions below.
 *
 * Splitting the token keeps the assertion and removes the source. It is not
 * built from `rowFurniture.ts`'s exports on purpose — an expected value taken
 * from the thing under test cannot disagree with it.
 *
 * **The variant is not the only half that has to be split.** The first
 * version of this helper took the utility whole, so the argument was itself
 * a bare candidate for the *base* utility, and the shipped sheet gained a
 * zero-padding and a zero-gap rule nothing in the app uses — the same leak
 * one layer down. The escaped spelling used in prose across this branch does
 * not reach that: measured, it hides the variant from the scanner and leaves
 * the base utility behind. Taking the property and the value apart leaves no
 * complete utility in this file at all, in code or in prose.
 * `src/__tests__/coarseNeedleSources.test.ts` is what notices if one comes
 * back.
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
 * trailing furniture, and each is a real call site — the props are the
 * ones a caller actually passes, not a combination the type allows.
 * `FileList` is the only thing that renders `FileListRow`, it passes
 * `onContextMenu` unconditionally, and its four callers split two and two:
 * `RootFileListing` and `folder/FolderContent` pass `selectable` *and*
 * `onFavoriteToggle`, `CollectionDetail` and `folder/RightPaneFolder` pass
 * neither.
 *
 * So selection mode draws the star: it stands the `⋮` down (the row means
 * "pick me" there, and right-click is already disabled for the same
 * reason) and keeps a trailing group of one, which is why it gives up its
 * trailing padding like the rest. The state where the row draws nothing at
 * the trailing edge is not here because nothing renders it; the test below
 * pins that branch of the guard on its own.
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
    expect(removed).toEqual([coarse(PR_0)]);
    // Both directions, the way the star's guard below is written. One
    // direction leaves the counterfactual free to gain a class of its own
    // and still read as "the shipped row with three things put back".
    expect(
      tokens(before.class).filter((c) => !tokens(shipped.class).includes(c)),
    ).toEqual([]);

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
    ).toEqual(["justify-center", coarse(H_11), coarse(W_11)]);
    expect(
      tokens(starBefore.class).filter((c) => !tokens(star.class).includes(c)),
    ).toEqual([]);

    // And the group draws the separation the row used to draw between the
    // two controls, cancelled exactly where the boxes grow to the floor.
    // That is what makes the counterfactual the shipped row at a fine
    // pointer rather than a wider one — the browser spec measures that;
    // jsdom can only say the classes are there.
    expect(tokens(group.class)).toContain("gap-3");
    expect(tokens(group.class)).toContain(coarse(GAP_0));
    expect(tokens(shipped.class)).toContain("gap-3");
  });

  it("keeps the trailing padding on a row that draws no trailing control", () => {
    // Not a fixture shape and not a call site: `FileList` passes
    // `onContextMenu` to every row, and the two callers that pass
    // `selectable` pass `onFavoriteToggle` with it, so no screen reaches
    // this branch. The props allow it, so the guard is here rather than
    // in the fixture — a row with nothing at its trailing edge has no
    // control whose own padding could stand in for the row's, and
    // dropping `.pointer-coarse\:pr-0` out of its condition would put this
    // row's text against the edge.
    //
    // jsdom lays nothing out: this is a claim about a class list, and the
    // padding it names is measured in `e2e-layout/list-row-furniture.spec.ts`.
    const row = render(
      <FileListRow file={file} selectable onSelect={vi.fn()} />,
    ).container.firstElementChild!;
    expect(tokens(classOf(row))).not.toContain(coarse(PR_0));
    expect(tokens(classOf(row))).toContain("p-2.5");
    expect(Array.from(row.children)).toHaveLength(1);
  });

  it("pins how the two containers the row kinds are stacked in are written", () => {
    // The fixture writes one column class by hand and stacks every shape
    // in it, file rows and the folder row together. In the app they are
    // two containers, drawn as siblings by `FolderContent`: the folder
    // rows go in its own `FolderShelf` and the file rows in `FileList`.
    //
    // **What this holds is three spellings, and only those.** If either
    // container's own statement changes — a class added to it, a wrapper
    // put inside it — this goes red and the change has to be looked at.
    // Both pins reach up to the statement that returns the column rather
    // than to its opening tag, because a bare tag survives being wrapped:
    // pinning only `<div className="flex flex-col">` left
    // `<div className="px-2"><div className="flex flex-col">` green across
    // `tsc` and the whole unit suite, which is round 1's own 8px
    // misalignment on the container this case was added to guard.
    //
    // **What it does not hold is the alignment.** An earlier version of
    // this comment said the pins stand for "neither container insets its
    // rows horizontally, which is what puts the two `⋮` columns at one x".
    // Nothing here holds that, and nothing text-matching can. Measured:
    // wrapping `<FileList …>` at its call site in `FolderContent.tsx` in
    // `<div className="px-2">` reproduces exactly that misalignment — the
    // folder rows stay at the container edge, the file rows move in 8px —
    // and leaves the whole unit suite, `tsc` and all 147 browser cases
    // green. Neither container was touched, so neither pin can see it.
    //
    // Pinning the parent as well is not the repair: the inset would move
    // to the grandparent, and then to a third component, a wrapper around
    // `FolderShelf`, or a stylesheet rule. There is no bounded set of
    // places an inset can be introduced, which is `review-workflow.md`'s
    // "a whitelist of spellings loses to the next spelling" one level up
    // from the sheet — so the claim is narrowed rather than the population
    // extended.
    //
    // **Where the alignment would actually be measured**: on real boxes,
    // by a fixture that stacks both row kinds the way `FolderContent`
    // does, asserting the two `⋮` columns share an x. `e2e-layout/` cannot
    // be extended into that by another `toContain` — its fixtures write
    // their own markup instead of mounting the components, which is why
    // its current one measures a hand-written column and says nothing
    // about who wraps it in the app. That fixture is not written; today
    // the alignment rests on the shared recipe in `rowFurniture.ts` and on
    // review.
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
