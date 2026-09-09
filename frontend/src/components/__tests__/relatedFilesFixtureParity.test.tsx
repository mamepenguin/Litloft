/**
 * The related-files layout fixture's markup table, against the component
 * it copies.
 *
 * `e2e-layout/related-files.spec.ts` measures a column count and a number
 * of readable characters in Chromium, and a browser suite can only see
 * what the markup in front of it produces. Here the markup *is* the
 * measurement: the tile's name column is what is left of the tile after
 * `p-2`, the `w-24` thumbnail, the `gap-3` between them and the 14px kind
 * glyph with its `gap-1.5`. Drop any one of those from the fixture's
 * table and it still measures a column count — of a tile this app does
 * not have, reporting character counts that are about nothing.
 *
 * So this is the guard, and it is a parity test rather than one table
 * read twice: the fixture declares its markup as JSON inside the page,
 * and everything below comes from **rendering the component**.
 *
 * One render state is declared per row, by name, and each state's render
 * must equal its row — element, class list, attributes, descendant tree —
 * with the row names and the state names then compared as sets. Declared
 * per state rather than collected from the renders, for the reason
 * `justifiedGridFixtureParity.test.tsx` gives at length: an expectation
 * built out of the observation cannot catch a deletion, because the
 * removed element leaves both sides at once (detector rule 5).
 *
 * It also holds the precondition the container query rests on. See
 * "no media in the scope" below.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FileRelationsResponse } from "@/lib/api";

const getFileRelations = vi.fn<(id: string) => Promise<FileRelationsResponse>>();

// `getStreamUrl` is not used by the component today, and that is the
// point: the hover case below has to be able to render a `VideoPreview`
// if somebody adds one, or it would fail for the wrong reason and read
// as a guard that works.
vi.mock("@/lib/api", () => ({
  getFileRelations: (id: string) => getFileRelations(id),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ getSlotEntries: () => [] }),
}));

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

import { RelatedFilesSection } from "../RelatedFilesSection";
import { declareEach } from "@/test/declareEach";

/**
 * vitest's `it`, narrowed to the two arguments the helper uses.
 *
 * `it` is overloaded (options objects, `.each`, modifiers), so handing it
 * over unnarrowed makes the helper infer the options overload rather than
 * a test body.
 */
const registerCase: (title: string, body: () => void | Promise<void>) => void =
  it;

afterEach(cleanup);

interface Markup {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
}

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "related-files.html",
);

const FIXTURE_HTML = readFileSync(FIXTURE, "utf8");

const SHAPES: Record<string, Markup> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/** Four tile shapes: a picture, a video, a kind glyph, a missing file. */
const SHAPE_COUNT = 4;

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

/**
 * The rendered element against its declared row, exactly.
 *
 * A node written without a `children` key is declared partially on
 * purpose and stops the walk — used here for the lucide `<svg>`s, whose
 * `<path>` data is a drawing and moves no box. Everything else is
 * exhaustive from there down, attributes included: a subset check is what
 * let the other fixture's table quietly drop `draggable`.
 *
 * An attribute value of `"*"` asks for presence only.
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

type Relation = FileRelationsResponse["relations"][number];

const relation = (over: Partial<Relation["file"]>, id: number): Relation => ({
  relation_id: id,
  kind: "related",
  created_at: "2026-09-08T00:00:00Z",
  created_by: null,
  file: {
    id: `f${id}`.padEnd(12, "x"),
    drive: "test-drive",
    filename: "4822843331_db5bab77bb_o.jpg",
    folder_path: "test_images",
    file_type: "image",
    mime_type: "image/jpeg",
    thumbnail_url: "/api/files/x/thumbnail",
    has_thumbnail: true,
    file_size: 1234,
    missing_since: null,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    ...over,
  },
});

/**
 * One render state per fixture row, declared by name.
 *
 * `thumbnail` and `icon` are the two subtrees the thumbnail box can hold,
 * and they are chosen by `has_thumbnail`, not by kind — but the kind also
 * picks the glyph beside the name, so the pair is written out rather than
 * derived. `missing` is the third class list the anchor can carry.
 */
const STATES: Record<string, Relation> = {
  thumbnail: relation({}, 1),
  // A video relation, and the media guard below is why it is here: the
  // way this codebase mounts a `<video>` is behind `file_type ===
  // "video"` plus a hover delay, so states that are all images and
  // documents never walk that branch.
  video: relation(
    { filename: "clip.mp4", file_type: "video", mime_type: "video/mp4" },
    4,
  ),
  icon: relation(
    {
      filename: "notes.md",
      file_type: "document",
      mime_type: "text/markdown",
      has_thumbnail: false,
    },
    2,
  ),
  missing: relation(
    {
      filename: "gone.md",
      file_type: "document",
      mime_type: "text/markdown",
      has_thumbnail: false,
      missing_since: "2026-09-01T00:00:00Z",
    },
    3,
  ),
};

async function renderTile(state: Relation): Promise<HTMLElement> {
  getFileRelations.mockResolvedValue({ relations: [state] });
  const { container } = render(<RelatedFilesSection fileId="f1" />);
  await screen.findByRole("link");
  return container.querySelector<HTMLElement>(".related-files-grid > a")!;
}

describe("the related-files layout fixture's markup table", () => {
  it("declares exactly the shapes the states below render", () => {
    expect(Object.keys(SHAPES).sort()).toEqual(Object.keys(STATES).sort());
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
  });

  const declared = declareEach(
    Object.entries(STATES),
    registerCase,
    ([name, state]) => ({
      title: `matches the component's ${name} tile`,
      id: name,
      body: async () => {
        expectMarkup(await renderTile(state), SHAPES[name], name);
      },
    }),
  );

  it("rendered a tile for every state the table declares", () => {
    // The loop, not the table it walks: the guard above compares
    // `STATES` with `SHAPES` and pins the count, and both stay green
    // against a loop given `.slice(0, 1)`.
    expect(declared).toEqual(Object.keys(STATES));
  });

  it("names the host and grid classes the fixture builds", async () => {
    // The fixture writes these two class names by hand. If the component
    // renamed either, every case in `related-files.spec.ts` would go on
    // measuring a page that still lays out correctly — and the app would
    // be back to one unconditional column, or none of the rules at all.
    //
    // Both sides are declared **whole**. `df1474e5` pinned the grid's
    // list exactly and checked the host with
    // `classList.contains("p-4") === false`: one named token, so
    // `related-files-host px-4` passed all sixty assertions in this
    // change — and that is the one mistake the wrapper exists to
    // prevent. The query then fires on the host's 720px while the grid
    // inside it is 688, and each column is 340px, under the rail again.
    await renderTile(STATES.thumbnail);
    const host = document.querySelector(".related-files-host")!;
    const grid = host.firstElementChild!;
    expect(classOf(host)).toBe("related-files-host");
    expect(classOf(grid)).toBe("related-files-grid grid gap-2");
    expect(FIXTURE_HTML).toContain('host.className = "related-files-host"');
    expect(FIXTURE_HTML).toContain(
      'grid.className = "related-files-grid grid gap-2"',
    );
  });
});

describe("no media in the containment scope", () => {
  // The precondition the whole mechanism rests on, and the one thing in
  // this change that jsdom is the right tool for.
  //
  // `container-type` establishes a containment context, and on iOS Safari
  // one wrapped around a `<video>`, `<audio>` or cross-origin iframe
  // renders the whole subtree rotated and continuously spinning
  // (`globals.css` ~line 820, hako 7bFYOh3vFZP9EEuf9Ym_5). No desktop
  // browser shows it, so the Chromium suite cannot see this coming and
  // neither can a developer's own machine. What makes the query safe here
  // is a fact about the subtree, and a fact about a subtree is exactly
  // what a DOM assertion can hold.
  //
  // **The question is reachability, not first paint.** This repository's
  // `<video>` is not in anybody's initial render: `VideoPreview` mounts
  // one 200ms after `mouseenter` (`HOVER_DELAY_MS`), `FileCard` puts
  // exactly that inside a thumbnail box the same shape as this tile's,
  // and `lib/cardGrid.ts` names it as the reason the card grids measure
  // with a `ResizeObserver` instead of asking `@container`. So "give the
  // related-file tile the hover preview the card has" is an ordinary
  // next change, and a guard that only looks at the tree as rendered
  // would pass it.
  const media = (root: Element) =>
    root.querySelectorAll("video, audio, iframe, object, embed");

  it("holds no media before or after the interaction that mounts one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      for (const state of Object.values(STATES)) {
        cleanup();
        await renderTile(state);
        const host = document.querySelector(".related-files-host")!;
        expect(media(host), "on first paint").toHaveLength(0);

        // The events `VideoPreview` listens for, on **every element in
        // the scope** and not just the tile. `mouseenter` does not
        // bubble and React derives `onMouseEnter` from it, so firing on
        // an ancestor reaches nothing: the first version of this guard
        // fired on the anchor alone and a `VideoPreview` added to the
        // tile survived it. Where a future author puts the handler is
        // not something this test should have to know.
        for (const el of [host, ...host.querySelectorAll("*")]) {
          fireEvent.mouseOver(el);
          fireEvent.mouseEnter(el);
          fireEvent.pointerEnter(el);
          fireEvent.focus(el);
          fireEvent.touchStart(el, { touches: [{ clientX: 0, clientY: 0 }] });
        }
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });
        expect(media(host), "after hover").toHaveLength(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("contains nothing but the grid, and nothing but tiles inside it", async () => {
    // The other half, and it replaces two substring checks over the
    // component's own source (`not.toContain("AddonSlot")`,
    // `not.toContain("children")`). Those were the shape this PR's own
    // docstrings reject twice — text standing in for a fact about a
    // subtree — and the second matched comment prose, so a future
    // comment using the word would have turned the suite red saying
    // nothing useful.
    //
    // Declared as the whole shape instead: the containment scope is the
    // grid and the tiles, and the tiles are pinned element-for-element
    // by the cases above. Anything added anywhere inside — an addon
    // slot, a preview, a heading — lands in one of the two and is red.
    getFileRelations.mockResolvedValue({
      relations: Object.values(STATES).map((r, i) => ({
        ...r,
        relation_id: i + 1,
      })),
    });
    const { container } = render(<RelatedFilesSection fileId="f1" />);
    await screen.findAllByRole("link");

    const host = container.querySelector(".related-files-host")!;
    expect(Array.from(host.children).map((c) => classOf(c))).toEqual([
      "related-files-grid grid gap-2",
    ]);
    const grid = host.firstElementChild!;
    expect(
      Array.from(grid.children).map((c) => c.tagName.toLowerCase()),
    ).toEqual(Object.keys(STATES).map(() => "a"));
  });
});
