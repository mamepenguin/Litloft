/**
 * The justified image grid, as the listing actually renders it.
 *
 * `deriveListMeta` decides *whether* to pack and is unit-tested next to
 * itself; this file checks that `FileGrid` obeys the answer in both
 * directions, and that a packed cell carries the geometry the CSS in
 * `globals.css` reads. A rule that is right and unwired looks exactly
 * like no rule at all.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `TextThumbnail` observes itself into view; jsdom has no such observer,
// and the preview fetch is not what these tests are about.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
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
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

import { FileGrid } from "../FileGrid";
import { JG_MAX_RATIO, JG_MIN_RATIO } from "@/lib/justifiedGrid";
import { formatFileSize } from "@/lib/format";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id: "file1",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024000,
  duration: 120,
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

const photos = (n: number, dims: { w: number | null; h: number | null } = { w: 3000, h: 4000 }) =>
  Array.from({ length: n }, (_, i) =>
    makeFile({
      id: `p${i}`,
      title: `Photo ${i}`,
      filename: `shot-${i}.jpg`,
      file_type: "image",
      mime_type: "image/jpeg",
      duration: null,
      image_width: dims.w,
      image_height: dims.h,
    }),
  );

const clips = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    makeFile({ id: `v${i}`, title: `Clip ${i}`, filename: `clip-${i}.mp4` }),
  );

const css = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8",
);

const grid = (c: HTMLElement) => c.querySelector(".justified-grid");
const cells = (c: HTMLElement) => c.querySelectorAll(".justified-grid-cell");

describe("FileGrid — justified rows", () => {
  it("packs a folder of measured photographs", () => {
    const { container } = render(<FileGrid files={photos(20)} />);
    expect(grid(container)).not.toBeNull();
    expect(cells(container)).toHaveLength(20);
  });

  it("leaves a folder of videos on equal cards", () => {
    const { container } = render(<FileGrid files={clips(20)} />);
    expect(grid(container)).toBeNull();
  });

  it("leaves videos on equal cards even carrying dimensions", () => {
    // The scanner does not fill `image_width` for video — the thumbnail
    // is padded to 16:9, so a true ratio would have nowhere to go. The
    // rule tests the file type as well as the columns, so that a row
    // that acquires them some other way still keeps its meta line.
    const files = clips(20).map((f) => ({
      ...f,
      image_width: 1920,
      image_height: 1080,
    }));
    const { container } = render(<FileGrid files={files} />);
    expect(grid(container)).toBeNull();
  });

  it("leaves photographs whose dimensions were never stored on equal cards", () => {
    const { container } = render(
      <FileGrid files={photos(20, { w: null, h: null })} />,
    );
    expect(grid(container)).toBeNull();
  });

  it("leaves a search result set on equal cards, all photographs or not", () => {
    const files = photos(20).map((f) => ({
      ...f,
      match_meta: { kind: "caption" as const },
    }));
    const { container } = render(<FileGrid files={files as never} />);
    expect(grid(container)).toBeNull();
  });

  it("stops the ratio at both ends", () => {
    const { container } = render(
      <FileGrid
        files={[
          ...photos(1, { w: 100, h: 1000 }),
          ...photos(1, { w: 1000, h: 100 }),
          ...photos(18),
        ].map((f, i) => ({ ...f, id: `r${i}` }))}
      />,
    );
    const ratios = Array.from(cells(container)).map((cell) =>
      Number((cell as HTMLElement).style.getPropertyValue("--jg-ratio")),
    );
    expect(ratios).toHaveLength(20);
    expect(Math.min(...ratios)).toBe(JG_MIN_RATIO);
    expect(Math.max(...ratios)).toBe(JG_MAX_RATIO);
  });

  it("draws a row with no known ratio as a square", () => {
    const files = [...photos(19), ...clips(1)];
    const { container } = render(<FileGrid files={files} />);
    // The one unmeasurable row of twenty: 3000x4000 is 0.75, so a 1 can
    // only have come from the fallback.
    const ratios = Array.from(cells(container)).map((cell) =>
      Number((cell as HTMLElement).style.getPropertyValue("--jg-ratio")),
    );
    expect(ratios.filter((r) => r === 1)).toHaveLength(1);
  });

  it("ends the grid with exactly one slack absorber", () => {
    const { container } = render(<FileGrid files={photos(20)} />);
    expect(container.querySelectorAll(".justified-grid-tail")).toHaveLength(1);
    expect(grid(container)!.lastElementChild).toHaveClass("justified-grid-tail");
  });

  it("gives that absorber a grow factor that dominates the cells", () => {
    // The element existing is not the property. Free space on a flex
    // line is shared in proportion to the grow factors, and every cell
    // carries `flex-grow: var(--jg-ratio)` — up to `JG_MAX_RATIO`, summed
    // across the line. At `flex-grow: 1` the absorber took 129px of the
    // 590 going spare and the last row still stretched 1.645x (measured
    // in Chromium on a 1469px grid). jsdom lays nothing out, so the
    // factor itself is what is pinned here; the layout is measured in a
    // browser.
    const tail = css.match(
      /\.justified-grid > \.justified-grid-tail \{([^}]*)\}/,
    );
    expect(tail).not.toBeNull();
    const grow = Number(tail![1].match(/flex-grow:\s*([\d.]+)/)![1]);
    // Three orders above the largest total a line can present: even a
    // line of a hundred 3:1 panoramas sums to 300.
    expect(grow).toBeGreaterThan(JG_MAX_RATIO * 1000);
  });

  it("carries no meta row", () => {
    // The fixtures are chosen so the card form would draw all three
    // columns: mixed extensions turn the badge on, and the sizes are
    // whatever `formatFileSize` really produces. The previous version of
    // this test matched `/1000 KB|1 MB/` against a 1024000-byte file,
    // which formats as "1000.0 KB" — and every row was a `.jpg`, so the
    // badge was already off. It passed with the whole feature deleted.
    const files = [
      ...photos(19),
      { ...photos(1)[0], id: "png", filename: "shot.png", title: "Shot PNG" },
    ];
    const { container } = render(<FileGrid files={files} />);

    // The population is not empty, and it really is the justified form.
    expect(cells(container)).toHaveLength(20);

    const sizes = files.map((f) => formatFileSize(f.file_size));
    expect(new Set(sizes).size).toBeGreaterThan(0);
    for (const size of new Set(sizes)) {
      expect(screen.queryByText(size)).toBeNull();
    }
    expect(screen.queryAllByText(/^(jpg|png)$/i)).toHaveLength(0);

    // And the same rows on the card form do draw them — otherwise the
    // assertions above are about fixtures that say nothing anywhere.
    cleanup();
    render(<FileGrid files={files.map((f) => ({ ...f, image_width: null, image_height: null }))} />);
    expect(screen.getAllByText(sizes[0]).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^(jpg|png)$/i).length).toBeGreaterThan(0);
  });

  it("names every cell, for the hover band to reveal", () => {
    const { container } = render(<FileGrid files={photos(20)} />);
    const names = container.querySelectorAll(".justified-grid-name");
    expect(names).toHaveLength(20);
  });

  it("draws the ten percent that are not photographs as themselves", () => {
    // `JUSTIFY_THRESHOLD` admits 10% non-image rows on purpose, so the
    // cell has to answer for them. Both of these have no thumbnail, and
    // both were drawing the shared placeholder — one picture for two
    // different files.
    const files = [
      ...photos(18),
      makeFile({
        id: "txt",
        title: "Notes",
        filename: "notes.txt",
        file_type: "document",
        mime_type: "text/plain",
        has_thumbnail: false,
        duration: null,
      }),
      makeFile({
        id: "zip",
        title: "Archive",
        filename: "backup.zip",
        file_type: "archive",
        mime_type: "application/zip",
        has_thumbnail: false,
        duration: null,
      }),
    ];
    const { container } = render(<FileGrid files={files} />);

    expect(cells(container)).toHaveLength(20);
    // Eighteen photographs have a thumbnail; the other two must not.
    expect(container.querySelectorAll("img")).toHaveLength(18);
    expect(screen.getByTestId("text-thumbnail")).toBeInTheDocument();
    // The archive gets a type icon — an `<svg>` from lucide, which is
    // the only svg a justified cell draws apart from the selection tick
    // (selection is off here).
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("keeps a video's preview and duration in the ten percent", () => {
    const files = [
      ...photos(18),
      makeFile({
        id: "v1",
        title: "Clip",
        filename: "clip.mp4",
        file_type: "video",
        duration: 125,
      }),
      makeFile({ id: "v2", title: "Clip 2", filename: "clip2.mp4", duration: null }),
    ];
    render(<FileGrid files={files} />);
    // 2:05 — the badge the card form draws, which the cell was dropping.
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("does not put the filename into the image's accessible name twice", () => {
    // The caption band already names the cell, inside the same link.
    const { container } = render(<FileGrid files={photos(20)} />);
    const alts = [...container.querySelectorAll("img")].map((i) =>
      i.getAttribute("alt"),
    );
    expect(alts).toHaveLength(20);
    expect(alts.every((a) => a === "")).toBe(true);
  });

  it("keeps shift range selection in DOM order", () => {
    const onShiftSelect = vi.fn();
    const files = photos(20);
    const { container } = render(
      <FileGrid
        files={files}
        selectable
        selectedIds={new Set()}
        onSelect={vi.fn()}
        onShiftSelect={onShiftSelect}
      />,
    );
    const rendered = Array.from(cells(container)).map(
      (cell) => cell.querySelector("img")!.getAttribute("src"),
    );
    expect(rendered).toEqual(files.map((f) => `/api/files/${f.id}/thumbnail`));

    fireEvent.click(cells(container)[4].querySelector('[role="button"]')!, {
      shiftKey: true,
    });
    expect(onShiftSelect).toHaveBeenCalledWith("p4");
  });
});

describe("justified row geometry", () => {
  /**
   * The row height is CSS, so this is where it is pinned. It is a
   * container query rather than a media query because the grid renders
   * beside a 280px tree pane — `DESIGN.md` §8.5.
   */
  it("switches the row height on the grid's own width", () => {
    expect(css).toContain("--jg-row-h: 120px");
    expect(css).toContain("@container justified-grid (min-width: 40rem)");
    expect(css).toContain("--jg-row-h: 200px");
    expect(css).toContain("container-type: inline-size");
  });

  it("reveals the name on hover and on focus", () => {
    // Both halves of "ホバーとフォーカスの両方", each named. The hover
    // selector had no assertion at all before.
    expect(css).toMatch(/\.group:hover > \.justified-grid-name/);
    expect(css).toMatch(/\.group:focus-within > \.justified-grid-name/);
  });

  it("shows the name without a hover where there is none", () => {
    // `@media (pointer: coarse)` alone is not evidence: globals.css has
    // carried such a block since before this feature, so `toContain`
    // stayed green with the rule deleted. The block that has to exist is
    // the one naming this class.
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{\s*\.justified-grid-name \{[^}]*opacity:/,
    );
  });

  it("gives the slack absorber no height", () => {
    expect(css).toMatch(
      /\.justified-grid > \.justified-grid-tail \{[^}]*height: 0;/,
    );
  });
});
