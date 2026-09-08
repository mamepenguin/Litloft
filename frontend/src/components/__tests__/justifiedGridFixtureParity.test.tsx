/**
 * The layout fixture's markup table, against the components it copies.
 *
 * `e2e-layout/fixtures/justified-grid.html` hand-writes the cells it
 * measures, and a browser suite can only see a selector that matches the
 * markup in front of it. So the fixture's fidelity is not a tidiness
 * question: when it drifted, three CSS-only bypasses that break shipped
 * markup — `button.justified-grid-cell`,
 * `.justified-grid-cell.overflow-hidden`, `.justified-grid-cell.select-none`
 * — went green, and stripping the fixture's classes silently retired a row
 * of its own results table.
 *
 * This is the guard, and it is a parity test rather than one table read
 * twice: the fixture declares its class lists as JSON in the page, and
 * everything below is derived from **rendering the two components** over
 * every reachable combination of the props that decide a cell's class.
 * Drift in either direction is red.
 *
 * Two callers write a `.justified-grid-cell` — `JustifiedFileCell`
 * through `FileGrid`, and `ArchiveEntryCard` through `ArchiveEntryGrid`.
 * A third would not be noticed here; it would have to arrive with a row
 * in the table and a case below.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
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
          [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
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

/** The table the fixture builds its cells from, read out of the page. */
type ShapeSpec = {
  source: string;
  tag: string;
  class: string;
  chain: { tag: string; class: string }[];
};

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

/** `JustifiedFileCell` in four states, `ArchiveEntryCard` in two. */
const SHAPE_COUNT = 6;

/** Class attributes are whitespace-insensitive; the components build
 *  theirs by template interpolation and leave empty slots behind. */
const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const vocabulary = (classNames: string[]) =>
  [...new Set(classNames.flatMap(tokens))].sort();

const shapesFrom = (source: string) =>
  Object.entries(SHAPES).filter(([, spec]) => spec.source === source);

/**
 * The descendant chain, found in the rendered cell **by the classes the
 * fixture declares** and then required to match exactly.
 *
 * Both directions fail from one assertion: a class the component stopped
 * writing makes the query find nothing, and a class it started writing
 * makes the equality fail. Locating by position instead would have found
 * the download link the dead-end archive cell puts first.
 */
function expectChain(cell: HTMLElement, spec: ShapeSpec) {
  for (const link of spec.chain) {
    const selector =
      link.tag + tokens(link.class).map((t) => `.${CSS.escape(t)}`).join("");
    const found = Array.from(cell.querySelectorAll(selector));
    expect(found, `${spec.source}: no unique ${selector}`).toHaveLength(1);
    expect(normalise((found[0] as HTMLElement).className)).toBe(
      normalise(link.class),
    );
  }
}

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

/** Twenty of them, because `deriveListMeta` only packs a folder that is
 *  mostly measurable photographs. */
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
 * Every combination of the three props that put a class on a photo cell,
 * minus the one the listing cannot produce: `isDragging` comes from
 * `draggedIds`, which `FileGrid` only fills while a drag is in flight,
 * and a drag needs `draggable`.
 */
const PHOTO_STATES = [
  { draggable: false, dragging: false, cut: false },
  { draggable: false, dragging: false, cut: true },
  { draggable: true, dragging: false, cut: false },
  { draggable: true, dragging: false, cut: true },
  { draggable: true, dragging: true, cut: false },
  { draggable: true, dragging: true, cut: true },
];

function renderPhotoCell(state: (typeof PHOTO_STATES)[number]) {
  cutIds = state.cut ? new Set(["p0"]) : new Set();
  const { container } = render(
    <FileGrid
      files={photos()}
      draggable={state.draggable}
      draggedIds={state.dragging ? new Set(["p0"]) : undefined}
      onDragStart={state.draggable ? vi.fn() : undefined}
    />,
  );
  const cell = container.querySelector(".justified-grid-cell")!;
  expect(cell).not.toBeNull();
  return cell as HTMLElement;
}

function renderArchiveCell(clickable: boolean) {
  const { container } = render(
    <ArchiveEntryGrid
      entries={[archiveEntry("page-0.jpg")]}
      fileId="file-1"
      handleDirClick={vi.fn()}
      handleFileClick={vi.fn()}
      isClickable={() => clickable}
    />,
  );
  const cell = container.querySelector(".justified-grid-cell")!;
  expect(cell).not.toBeNull();
  return cell as HTMLElement;
}

describe("the layout fixture's markup table", () => {
  it("declares exactly the shapes the two callers can produce", () => {
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
    expect(shapesFrom("JustifiedFileCell")).toHaveLength(4);
    expect(shapesFrom("ArchiveEntryCard")).toHaveLength(2);
    // Every shape names a caller this file renders. A row citing a third
    // component would be unverified by anything here.
    expect(
      [...new Set(Object.values(SHAPES).map((s) => s.source))].sort(),
    ).toEqual(["ArchiveEntryCard", "JustifiedFileCell"]);
  });

  describe("against JustifiedFileCell", () => {
    const rendered = () =>
      PHOTO_STATES.map((state) => {
        const el = renderPhotoCell(state);
        const snapshot = {
          tag: el.tagName.toLowerCase(),
          className: normalise(el.className),
        };
        cleanup();
        return snapshot;
      });

    it("carries every class the component can put on a cell, and no other", () => {
      const cells = rendered();
      expect(cells).toHaveLength(PHOTO_STATES.length);
      expect(vocabulary(cells.map((c) => c.className))).toEqual(
        vocabulary(shapesFrom("JustifiedFileCell").map(([, s]) => s.class)),
      );
    });

    it("declares only class lists the component actually renders", () => {
      const produced = new Set(rendered().map((c) => c.className));
      for (const [name, spec] of shapesFrom("JustifiedFileCell")) {
        expect(
          produced,
          `fixture shape ${name} declares a class list no state produces`,
        ).toContain(normalise(spec.class));
        expect(spec.tag).toBe("div");
      }
    });

    it("copies the wrapper and the image the cell contains", () => {
      // Every state renders the same two, so one is enough to compare
      // all four declared chains against.
      const cell = renderPhotoCell(PHOTO_STATES[0]);
      for (const [, spec] of shapesFrom("JustifiedFileCell")) {
        expect(spec.chain).toHaveLength(2);
        expectChain(cell, spec);
      }
      cleanup();
    });
  });

  describe("against ArchiveEntryCard", () => {
    const rendered = () =>
      [true, false].map((clickable) => {
        const el = renderArchiveCell(clickable);
        const snapshot = {
          tag: el.tagName.toLowerCase(),
          className: normalise(el.className),
        };
        cleanup();
        return snapshot;
      });

    it("carries every class the component can put on a cell, and no other", () => {
      const cells = rendered();
      expect(cells).toHaveLength(2);
      expect(vocabulary(cells.map((c) => c.className))).toEqual(
        vocabulary(shapesFrom("ArchiveEntryCard").map(([, s]) => s.class)),
      );
    });

    it("declares the openable cell as the button the component renders", () => {
      const [openable, deadEnd] = rendered();
      const byClass = new Map(
        shapesFrom("ArchiveEntryCard").map(([, s]) => [
          normalise(s.class),
          s,
        ]),
      );

      expect(byClass.get(openable.className)?.tag).toBe(openable.tag);
      expect(openable.tag).toBe("button");
      expect(byClass.get(deadEnd.className)?.tag).toBe(deadEnd.tag);
      expect(deadEnd.tag).toBe("div");
    });

    it("copies the two boxes and the image the cell contains", () => {
      // Checked against both, because the dead-end cell renders a
      // download link the openable one does not.
      for (const clickable of [true, false]) {
        const cell = renderArchiveCell(clickable);
        for (const [, spec] of shapesFrom("ArchiveEntryCard")) {
          expect(spec.chain).toHaveLength(3);
          expectChain(cell, spec);
        }
        cleanup();
      }
    });
  });
});
