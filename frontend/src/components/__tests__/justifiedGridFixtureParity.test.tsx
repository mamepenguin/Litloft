/**
 * The layout fixture's markup table, against the components it copies.
 *
 * `e2e-layout/fixtures/justified-grid.html` hand-writes the cells it
 * measures, and a browser suite can only see a selector that matches the
 * markup in front of it. So the fixture's fidelity is not a tidiness
 * question. Measured, three times: while the fixture drew one cell shape,
 * `button.justified-grid-cell`, `.justified-grid-cell.overflow-hidden` and
 * `.justified-grid-cell.select-none` all broke shipped cells and stayed
 * green; while it declared four of the six class lists,
 * `.justified-grid-cell.opacity-50.select-none` did; and while it copied
 * class lists only, `[draggable]`, `:has(.justified-grid-name)` and
 * `:has(> a[download])` did.
 *
 * This is the guard, and it is a parity test rather than one table read
 * twice: the fixture declares its markup as JSON in the page, and
 * everything below comes from **rendering the two components**.
 *
 * ## The shape of the comparison, which is the part that matters
 *
 * One render state is declared per row, by name, and each state's render
 * must equal its row — element, class list, attributes, descendant tree.
 * The row names and the state names are then compared as sets.
 *
 * It is written that way because the earlier version compared a
 * *flattened token vocabulary* across all rows, and two rows were missing
 * from the table without either side noticing: every token still appeared
 * somewhere, so the two sets stayed equal. That is detector rule 5 exactly
 * — an expected value built out of the observation catches wrong values
 * and unregistered additions but **cannot catch a deletion**, because the
 * removed element leaves both sides at once. Expected sets are declared
 * per state here for that reason, and the rule matters more than the two
 * rows it was found by: the next shape to arrive meets the same structure.
 *
 * Two callers write a `.justified-grid-cell` — `JustifiedFileCell` through
 * `FileGrid`, and `ArchiveEntryCard` through `ArchiveEntryGrid`. A third
 * would not be noticed here; it would have to arrive with rows in the
 * table and states below.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ArchiveEntry, FileItem } from "@/types";

let cutIds = new Set<string>();

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb(
          [
            {
              isIntersecting: true,
              target: el,
            } as unknown as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
      }
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
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cutIds = new Set();
  cleanup();
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
    isCut: (id: string) => cutIds.has(id),
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

import { FileGrid } from "../FileGrid";
import { ArchiveEntryGrid } from "../archive/ArchiveEntryGrid";

/** One row of the table the fixture builds its cells from. */
type Markup = {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
};
type ShapeSpec = Markup & { source: string };

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "justified-grid.html",
);

const SHAPES: Record<string, ShapeSpec> = JSON.parse(
  readFileSync(FIXTURE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/** Eight for `JustifiedFileCell`, two for `ArchiveEntryCard`. */
const SHAPE_COUNT = 10;

/**
 * Every class list `JustifiedFileCell` can put on a cell.
 *
 * Its class attribute is three **independent** conditionals, not a
 * three-way choice — `isDragging`, `isCutFile`, `draggable` — and
 * `FolderContent` passes `draggable={!selectable || selectedCount > 0}`,
 * so the pairs are all reachable. Declared here rather than collected from
 * the renders below, which is the whole point of finding 3.
 */
const PHOTO_CELL_CLASSES = [
  "justified-grid-cell relative",
  "justified-grid-cell relative opacity-40 opacity-50 select-none",
  "justified-grid-cell relative opacity-40 select-none",
  "justified-grid-cell relative opacity-50",
  "justified-grid-cell relative opacity-50 select-none",
  "justified-grid-cell relative select-none",
];

/** Class attributes are whitespace-insensitive; the components build
 *  theirs by template interpolation and leave empty slots behind. */
const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

const shapesFrom = (source: string) =>
  Object.entries(SHAPES).filter(([, spec]) => spec.source === source);
const namesFrom = (source: string) => shapesFrom(source).map(([name]) => name).sort();

const photoFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  id: "p0",
  filename: "shot.jpg",
  title: "Shot",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1024,
  duration: null,
  image_width: 3000,
  image_height: 4000,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  ...overrides,
});

/** Twenty, because `deriveListMeta` only packs a folder that is mostly
 *  measurable photographs. `p0` is the cell every assertion reads. */
const photos = () =>
  Array.from({ length: 20 }, (_, i) => photoFile({ id: `p${i}` }));

const archiveEntry = (path: string): ArchiveEntry => ({
  path,
  filename: path.split("/").pop()!,
  file_size: 1024,
  compressed_size: 512,
  file_type: "image",
  mime_type: "image/jpeg",
  is_dir: false,
});

/**
 * A render state, and the row it has to produce.
 *
 * `draggable` is `undefined` rather than `false` in `linkedOnly`, and the
 * difference is not cosmetic: React writes `draggable="false"` for the
 * boolean and omits the attribute for `undefined`, so
 * `.justified-grid-cell[draggable]` reaches one and not the other.
 * `CollectionDetail`, `RightPaneFolder` and the intelligence addon's
 * pickup page all render `FileGrid` without the prop.
 */
type PhotoState = {
  shape: string;
  selectable?: boolean;
  selected?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  cut?: boolean;
};

const PHOTO_STATES: PhotoState[] = [
  // selectable off, so `FolderContent` passes draggable = true.
  { shape: "browsing", draggable: true },
  { shape: "browsingCut", draggable: true, cut: true },
  { shape: "browsingDragging", draggable: true, dragging: true },
  { shape: "browsingDraggingCut", draggable: true, dragging: true, cut: true },
  // Select mode with nothing selected yet: draggable = false.
  { shape: "selecting", selectable: true, draggable: false },
  { shape: "selectingCut", selectable: true, draggable: false, cut: true },
  // Select mode with a selection, so dragging is back on.
  { shape: "selected", selectable: true, selected: true, draggable: true },
  // A caller that passes no `draggable` at all.
  { shape: "linkedOnly" },
];

function renderPhotoCell(state: PhotoState): HTMLElement {
  cutIds = state.cut ? new Set(["p0"]) : new Set();
  const { container } = render(
    <FileGrid
      files={photos()}
      selectable={state.selectable}
      selectedIds={state.selected ? new Set(["p0"]) : undefined}
      onSelect={state.selectable ? vi.fn() : undefined}
      draggable={state.draggable}
      draggedIds={state.dragging ? new Set(["p0"]) : undefined}
      onDragStart={state.draggable ? vi.fn() : undefined}
    />,
  );
  const cell = container.querySelector(".justified-grid-cell");
  expect(cell, "FileGrid did not pack the folder").not.toBeNull();
  return cell as HTMLElement;
}

function renderArchiveCell(clickable: boolean): HTMLElement {
  const { container } = render(
    <ArchiveEntryGrid
      entries={[archiveEntry("page-0.jpg")]}
      fileId="file-1"
      handleDirClick={vi.fn()}
      handleFileClick={vi.fn()}
      isClickable={() => clickable}
    />,
  );
  const cell = container.querySelector(".justified-grid-cell");
  expect(cell).not.toBeNull();
  return cell as HTMLElement;
}

const ARCHIVE_STATES = [
  { shape: "archiveOpenable", clickable: true },
  { shape: "archiveDeadEnd", clickable: false },
];

/**
 * The declared markup, against the rendered element.
 *
 * Children are compared **positionally and exhaustively** — same count,
 * same order, same parentage — because anything looser cannot see a
 * deletion on the fixture's side. Measured: with children matched by
 * selector among the rendered ones, dropping the name span, the
 * `draggable` attribute or the archive's download link from the table all
 * left the suite green. The states below are rendered with the props that
 * make the tree exact (no `onFavoriteToggle`, an image with no duration),
 * so there is no conditional sibling to allow for.
 *
 * A node written without a `children` key is declared partially on
 * purpose and stops the walk: its declared attributes are checked, its
 * undeclared ones and its subtree are not. The table uses that twice —
 * the archive's download link, whose child is a lucide icon, and the
 * check mark `<svg>`, whose attributes are a drawing.
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

  // A node with no `children` key is declared partially on purpose, and
  // stops here. Everything else is exhaustive from here down.
  if (spec.children === undefined) return;

  // Exactly the declared attributes, and `class`, compared above. A
  // subset check let the table drop `draggable` and stay green.
  expect(
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((name) => name !== "class")
      .sort(),
    `${where}: attributes`,
  ).toEqual(Object.keys(spec.attrs ?? {}).sort());

  const kids = Array.from(el.children);
  expect(
    kids.map((k) => `${k.tagName.toLowerCase()}.${classOf(k)}`),
    `${where}: children`,
  ).toHaveLength(spec.children.length);
  spec.children.forEach((child, i) => {
    expectMarkup(kids[i], child, `${where} > [${i}] ${child.tag}`);
  });
}

describe("the layout fixture's markup table", () => {
  it("has one row per declared render state, and no other", () => {
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
    // The assertion the earlier vocabulary comparison could not make: a
    // row deleted here has nothing to pair with, and a state added below
    // has no row.
    expect(namesFrom("JustifiedFileCell")).toEqual(
      PHOTO_STATES.map((s) => s.shape).sort(),
    );
    expect(namesFrom("ArchiveEntryCard")).toEqual(
      ARCHIVE_STATES.map((s) => s.shape).sort(),
    );
    expect(new Set(PHOTO_STATES.map((s) => s.shape)).size).toBe(
      PHOTO_STATES.length,
    );
    expect(
      [...new Set(Object.values(SHAPES).map((s) => s.source))].sort(),
    ).toEqual(["ArchiveEntryCard", "JustifiedFileCell"]);
  });

  describe("against JustifiedFileCell", () => {
    for (const state of PHOTO_STATES) {
      it(`renders ${state.shape} exactly as the table declares it`, () => {
        expectMarkup(renderPhotoCell(state), SHAPES[state.shape], state.shape);
      });
    }

    it("covers every class list the cell can carry", () => {
      const rendered = PHOTO_STATES.map((state) => {
        const cls = classOf(renderPhotoCell(state));
        cleanup();
        return cls;
      });
      // Both comparisons have a declared side, so a class list that goes
      // missing from the table cannot hide behind one that is still there.
      expect([...new Set(rendered)].sort()).toEqual(PHOTO_CELL_CLASSES);
      expect(
        [...new Set(shapesFrom("JustifiedFileCell").map(([, s]) => normalise(s.class)))].sort(),
      ).toEqual(PHOTO_CELL_CLASSES);
    });
  });

  describe("against ArchiveEntryCard", () => {
    for (const state of ARCHIVE_STATES) {
      it(`renders ${state.shape} exactly as the table declares it`, () => {
        expectMarkup(
          renderArchiveCell(state.clickable),
          SHAPES[state.shape],
          state.shape,
        );
      });
    }
  });
});
