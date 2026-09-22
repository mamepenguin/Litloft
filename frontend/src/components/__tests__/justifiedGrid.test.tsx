import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
import { FLIP_DURATION_MS } from "@/hooks/useJustifiedFlip";
import { formatRelativeDate } from "@/lib/format";
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

/** `globals.css` with comments stripped — comments carry words like
 *  "height" in prose and would answer the assertions below. */
const sheet = css.replace(/\/\*[\s\S]*?\*\//g, "");

const rules: [string, string][] = [
  ...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g),
].map((m) => [m[1].trim(), m[2]]);

/**
 * Joined rather than "the first block": `.justified-grid` is written
 * twice, once plainly and once inside the container query, and both
 * blocks are declarations about the same element.
 */
const rule = (selector: string) => {
  const found = rules.filter(([sel]) => sel === selector);
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map(([, decls]) => decls).join("\n");
};
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
    // Free space on a flex line is shared in proportion to the grow
    // factors, and every cell carries `flex-grow: var(--jg-ratio)` — up
    // to `JG_MAX_RATIO`, summed across the line.
    const tail = css.match(
      /\.justified-grid > \.justified-grid-tail \{([^}]*)\}/,
    );
    expect(tail).not.toBeNull();
    const grow = Number(tail![1].match(/flex-grow:\s*([\d.]+)/)![1]);
    // Three orders above the largest total a line can present: even a
    // line of a hundred 3:1 panoramas sums to 300.
    expect(grow).toBeGreaterThan(JG_MAX_RATIO * 1000);
  });

  describe("the append transition", () => {
    const invertRule = rule('.justified-grid-cell[data-flip="invert"]');
    const playRule = rule('.justified-grid-cell[data-flip="play"]');

    it("holds the invert still and plays the release", () => {
      expect(invertRule).toMatch(/transition:\s*none/);
      expect(playRule).toMatch(/transition:\s*[^;]*transform\s+\d+ms/);
      expect(playRule).toMatch(/opacity\s+\d+ms/);
    });

    it("inverts about the corner a flex line lays out from, in both states", () => {
      for (const [name, decls] of [
        ["invert", invertRule],
        ["play", playRule],
      ] as const) {
        expect(decls, `transform-origin on ${name}`).toMatch(
          /transform-origin:\s*top left/,
        );
      }
    });

    const boxes = new Map<string, [number, number, number, number]>();
    let realRect: PropertyDescriptor;

    const script = (entries: Record<string, [number, number, number, number]>) => {
      boxes.clear();
      for (const [key, value] of Object.entries(entries)) boxes.set(key, value);
    };

    beforeAll(() => {
      const found = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "getBoundingClientRect",
      );
      if (!found) throw new Error("jsdom no longer owns getBoundingClientRect");
      realRect = found;
    });

    afterAll(() => {
      Object.defineProperty(Element.prototype, "getBoundingClientRect", realRect);
    });

    it("plays it on the real listing when a page is appended", async () => {
      Object.defineProperty(Element.prototype, "getBoundingClientRect", {
        configurable: true,
        value(this: Element) {
          const key = this.classList.contains("justified-grid")
            ? "grid"
            : this.getAttribute("data-flip-key");
          const [left, top, width, height] = boxes.get(key ?? "") ?? [0, 0, 0, 0];
          return {
            x: left, y: top, left, top, width, height,
            right: left + width, bottom: top + height,
            toJSON: () => ({}),
          } as DOMRect;
        },
      });
      try {
        script({
          grid: [0, 0, 1000, 200],
          p0: [0, 0, 200, 200], p1: [208, 0, 200, 200],
          p2: [416, 0, 200, 200], p3: [624, 0, 200, 200],
        });
        const { container, rerender } = render(<FileGrid files={photos(4)} />);
        expect(container.querySelectorAll("[data-flip]")).toHaveLength(0);

        // The next page. The line that was last fills the row, so its
        // four cells grow and the three after the first slide right.
        script({
          grid: [0, 0, 1000, 450],
          p0: [0, 0, 244, 244], p1: [252, 0, 244, 244],
          p2: [504, 0, 244, 244], p3: [756, 0, 244, 244],
          p4: [0, 252, 400, 200], p5: [408, 252, 400, 200],
        });
        await act(async () => {
          rerender(<FileGrid files={photos(6)} />);
        });

        expect(
          [...container.querySelectorAll<HTMLElement>("[data-flip]")].map((cell) => ({
            key: cell.getAttribute("data-flip-key"),
            flip: cell.getAttribute("data-flip"),
            transform: cell.style.transform,
            opacity: cell.style.opacity,
          })),
        ).toEqual(
          ["p0", "p1", "p2", "p3", "p4", "p5"].map((key) => ({
            key,
            flip: "play",
            transform: "",
            opacity: "",
          })),
        );
      } finally {
        Object.defineProperty(Element.prototype, "getBoundingClientRect", realRect);
        boxes.clear();
      }
    });

    it("agrees with the hook about how long the play lasts", () => {
      // `settle` removes `data-flip` at `FLIP_DURATION_MS + 50`, which
      // cancels a play still running: a CSS duration longer than the
      // constant makes every play jump to its end value part-way through.
      const durations = [...playRule.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
      expect(durations).toHaveLength(2);
      for (const ms of durations) expect(ms).toBe(FLIP_DURATION_MS);
    });
  });

  it("names every cell with the file's own id, for the transition to key on", () => {
    const files = photos(7);
    const { container } = render(<FileGrid files={files} />);
    expect(
      [...cells(container)].map((cell) => cell.getAttribute("data-flip-key")),
    ).toEqual(files.map((file) => file.id));
  });

  it("carries no meta row", () => {
    const files = [
      ...photos(19),
      { ...photos(1)[0], id: "png", filename: "shot.png", title: "Shot PNG" },
    ];
    const { container } = render(<FileGrid files={files} />);

    expect(cells(container)).toHaveLength(20);

    // Computed rather than written out: `formatRelativeDate` changes shape
    // once the fixture's year is not the current one.
    const date = formatRelativeDate(files[0].created_at);
    expect(screen.queryAllByText(date)).toHaveLength(0);
    expect(screen.queryAllByText(/^(jpg|png)$/i)).toHaveLength(0);

    cleanup();
    render(<FileGrid files={files.map((f) => ({ ...f, image_width: null, image_height: null }))} />);
    expect(screen.queryAllByText(date)).toHaveLength(20);
    expect(screen.queryAllByText(/^(jpg|png)$/i)).toHaveLength(20);
  });

  it("names every cell, for the hover band to reveal", () => {
    const { container } = render(<FileGrid files={photos(20)} />);
    const names = container.querySelectorAll(".justified-grid-name");
    expect(names).toHaveLength(20);
  });

  it("draws the ten percent that are not photographs as themselves", () => {
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
    expect(container.querySelectorAll("img")).toHaveLength(18);
    expect(screen.getByTestId("text-thumbnail")).toBeInTheDocument();
    // The archive gets a type icon — an `<svg>` from lucide, which is
    // the only svg a justified cell draws apart from the selection tick
    // (selection is off here).
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("keeps a video's duration badge and mounts no player for it", () => {
    // The grid host is a `container-type` context, and a containment
    // context around a `<video>` renders its subtree rotated and spinning
    // on iOS Safari. Do not restore the hover preview for parity with
    // `FileCard`, which is not under a container query.
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
    const { container } = render(<FileGrid files={files} />);

    expect(cells(container)).toHaveLength(20);
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.queryAllByTestId("video-preview-container")).toHaveLength(0);
  });

  it("names every cell the same way, whatever it draws", () => {
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
    render(<FileGrid files={files} />);

    for (const name of ["Photo 0", "Notes", "Archive"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(20);
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
