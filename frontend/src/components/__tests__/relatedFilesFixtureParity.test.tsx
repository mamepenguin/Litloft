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
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FileRelationsResponse } from "@/lib/api";

const getFileRelations = vi.fn<(id: string) => Promise<FileRelationsResponse>>();

vi.mock("@/lib/api", () => ({
  getFileRelations: (id: string) => getFileRelations(id),
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

/** Three tile shapes: a picture, a kind glyph, and a missing file. */
const SHAPE_COUNT = 3;

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

  for (const [name, state] of Object.entries(STATES)) {
    it(`matches the component's ${name} tile`, async () => {
      expectMarkup(await renderTile(state), SHAPES[name], name);
    });
  }

  it("names the host and grid classes the fixture builds", async () => {
    // The fixture writes these two class names by hand. If the component
    // renamed either, every case in `related-files.spec.ts` would go on
    // measuring a page that still lays out correctly — and the app would
    // be back to one unconditional column, or none of the rules at all.
    await renderTile(STATES.thumbnail);
    const host = document.querySelector(".related-files-host")!;
    const grid = host.firstElementChild!;
    expect(classOf(grid)).toBe("related-files-grid grid gap-2");
    expect(FIXTURE_HTML).toContain('host.className = "related-files-host"');
    expect(FIXTURE_HTML).toContain(
      'grid.className = "related-files-grid grid gap-2"',
    );
  });
});

describe("no media in the containment scope", () => {
  // The precondition the whole mechanism rests on, and the one thing in
  // this change that jsdom is genuinely the right tool for.
  //
  // `container-type` establishes a containment context, and on iOS Safari
  // one wrapped around a `<video>`, `<audio>` or cross-origin iframe
  // renders the whole subtree rotated and continuously spinning
  // (`globals.css` ~line 820, hako 7bFYOh3vFZP9EEuf9Ym_5). No desktop
  // browser shows it, so the Chromium suite cannot see this coming and
  // neither can a developer's own machine. What makes the query safe here
  // is a fact about the subtree, and a fact about a subtree is exactly
  // what a DOM assertion can hold.
  it("the host's subtree holds no video, audio or iframe", async () => {
    for (const state of Object.values(STATES)) {
      cleanup();
      await renderTile(state);
      const host = document.querySelector(".related-files-host")!;
      expect(host.querySelectorAll("video, audio, iframe, object, embed"))
        .toHaveLength(0);
    }
  });

  it("the section takes no children and mounts no addon slot", () => {
    // The other half of it: a subtree with no media today stays that way
    // only while nothing external can be put in it. `RelatedFilesSection`
    // renders its own tiles and nothing else — the sibling
    // `file-relations` slot, which an addon *can* fill with anything, is
    // outside the host on both surfaces (`ShellLayout`,
    // `FileDetailPresenter`).
    const source = readFileSync(
      join(__dirname, "..", "RelatedFilesSection.tsx"),
      "utf8",
    );
    expect(source).not.toContain("AddonSlot");
    expect(source).not.toContain("children");
  });
});
