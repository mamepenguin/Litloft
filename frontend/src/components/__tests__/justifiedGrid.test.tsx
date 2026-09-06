/**
 * The justified image grid, as the listing actually renders it.
 *
 * `deriveListMeta` decides *whether* to pack and is unit-tested next to
 * itself; this file checks that `FileGrid` obeys the answer in both
 * directions, and that a packed cell carries the geometry the CSS in
 * `globals.css` reads. A rule that is right and unwired looks exactly
 * like no rule at all.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("carries no meta row", () => {
    render(<FileGrid files={photos(20)} />);
    // The equal card draws the size and the relative date under the
    // thumbnail. A justified cell has unequal widths, so it draws
    // neither.
    expect(screen.queryByText(/1000 KB|1 MB/)).toBeNull();
    expect(screen.queryAllByText(/^jpg$/i)).toHaveLength(0);
  });

  it("names every cell, for the hover band to reveal", () => {
    const { container } = render(<FileGrid files={photos(20)} />);
    const names = container.querySelectorAll(".justified-grid-name");
    expect(names).toHaveLength(20);
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
  const css = readFileSync(
    join(__dirname, "..", "..", "app", "globals.css"),
    "utf8",
  );

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

  it("shows the name without a hover where there is none", () => {
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toMatch(/\.group:focus-within > \.justified-grid-name/);
  });

  it("gives the slack absorber no height", () => {
    expect(css).toMatch(
      /\.justified-grid > \.justified-grid-tail \{[^}]*height: 0;/,
    );
  });
});
