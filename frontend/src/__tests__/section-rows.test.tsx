import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { classValues, stripComments } from "./helpers/sourceScan";
import type { FileItem, WatchHistoryItem } from "@/types";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    // Addons are reached through `addons/`, not through the symlinks.
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) {
    const abs = resolve(REPO_ROOT, root);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

function classNameSites(token: RegExp): string[] {
  const out: string[] = [];
  for (const file of sourceFiles()) {
    const body = readFileSync(file, "utf-8");
    for (const value of classValues(body)) {
      if (token.test(value)) out.push(relative(REPO_ROOT, file));
    }
  }
  return out;
}

describe("no shelf hides its own scrollbar", () => {
  it("scans the source it claims to scan", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(500);
    for (const root of SOURCE_ROOTS) {
      expect(files.some((f) => f.startsWith(resolve(REPO_ROOT, root)))).toBe(
        true,
      );
    }
  });

  it("leaves no `scrollbar-hide` in any className", () => {
    expect(classNameSites(/\bscrollbar-hide\b/)).toEqual([]);
  });

  it("removes the utility as well as its callers", () => {
    const css = readFileSync(
      resolve(REPO_ROOT, "frontend/src/app/globals.css"),
      "utf-8",
    );
    expect(css).not.toMatch(/@utility\s+scrollbar-hide\b/);
    // A file that failed to load would pass the line above.
    expect(css).toMatch(/@utility\s+scrollbar-hover\b/);
  });

  it("leaves the sideways scrolling that is correct alone", () => {
    expect(new Set(classNameSites(/\boverflow-x-auto\b/))).toEqual(
      new Set([
        "frontend/src/app/admin/settings/AddonPolicySection.tsx",
        "frontend/src/app/setup/steps/DriveStep.tsx",
        "frontend/src/components/Breadcrumb.tsx",
        "frontend/src/components/CollectionPanel.tsx",
        "frontend/src/components/FileDetail/inspector/InspectorShell.tsx",
        "frontend/src/components/PageTabs.tsx",
        "addons/intelligence/frontend/ClipFramesSection.tsx",
        "addons/intelligence/frontend/VisualIndexSection.tsx",
      ]),
    );
  });
});

describe("the shelf shape is written once", () => {
  it("is `SectionRow`, and both shelves go through it", () => {
    for (const rel of [
      "frontend/src/components/CarouselSection.tsx",
      "frontend/src/components/ContinueWatchingSection.tsx",
    ]) {
      const body = stripComments(
        readFileSync(resolve(REPO_ROOT, rel), "utf-8"),
      );
      expect(body).toMatch(/<SectionRow>/);
      expect(body).not.toMatch(/\bsnap-x\b/);
    }
  });

  it("does not offer `ContinueWatchingSection` a total it cannot have", () => {
    const props = readFileSync(
      resolve(REPO_ROOT, "frontend/src/components/ContinueWatchingSection.tsx"),
      "utf-8",
    );
    expect(stripComments(props)).not.toMatch(/totalCount/);

    const api = stripComments(
      readFileSync(resolve(REPO_ROOT, "frontend/src/lib/api.ts"), "utf-8"),
    );
    expect(api).toMatch(
      /export async function getWatchHistory\([\s\S]*?\)\s*:\s*Promise<WatchHistoryItem\[\]>/,
    );
  });
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

vi.mock("@/lib/api", () => ({
  deleteWatchProgress: vi.fn(() => Promise.resolve()),
  renameFile: vi.fn(() => Promise.resolve({})),
  moveFile: vi.fn(() => Promise.resolve({})),
  deleteFile: vi.fn(() => Promise.resolve()),
  getDownloadUrl: vi.fn((id: string) => `/api/files/${id}/download`),
  getThumbnailUrl: vi.fn((id: string) => `/api/files/${id}/thumbnail`),
}));

vi.mock("../components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

import { CarouselSection } from "@/components/CarouselSection";
import { ContinueWatchingSection } from "@/components/ContinueWatchingSection";

const baseFile: FileItem = {
  id: "file-0",
  filename: "clip.mp4",
  title: "Clip 0",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/file-0/thumbnail",
  has_thumbnail: true,
  file_size: 1024,
  duration: 120,
  image_width: null,
  image_height: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
};

const twelveFiles: FileItem[] = Array.from({ length: 12 }, (_, i) => ({
  ...baseFile,
  id: `file-${i}`,
  filename: `clip-${i}.mp4`,
  title: `Clip ${i}`,
}));

const watchItem: WatchHistoryItem = {
  ...baseFile,
  watch_progress: { position: 30, duration: 120 },
};

let resize: (() => void) | undefined;

beforeEach(() => {
  resize = undefined;
  class ResizeObserverMock {
    constructor(callback: () => void) {
      resize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  widths = undefined;
});

let widths: ReturnType<typeof vi.spyOn> | undefined;

function atWidth(width: number) {
  widths ??= vi.spyOn(HTMLElement.prototype, "clientWidth", "get");
  widths.mockReturnValue(width);
}

function cardCount(): number {
  return screen.queryAllByText(/^Clip \d+$/).length;
}

describe("a shelf shows what fits and no more", () => {
  it("draws two columns over two rows on a 375px phone", () => {
    // 343px is a 375px viewport less the page's `px-4` gutters.
    atWidth(343);
    render(
      <CarouselSection title="Recently added" files={twelveFiles} loading={false} />,
    );
    expect(cardCount()).toBe(4);
  });

  it("draws one row of five on a 1512px desktop", () => {
    atWidth(1480);
    render(
      <CarouselSection title="Recently added" files={twelveFiles} loading={false} />,
    );
    expect(cardCount()).toBe(5);
  });

  it("re-counts when the canvas changes width", () => {
    atWidth(1480);
    render(
      <CarouselSection title="Recently added" files={twelveFiles} loading={false} />,
    );
    expect(cardCount()).toBe(5);

    atWidth(343);
    act(() => resize!());
    expect(cardCount()).toBe(4);
  });

  it("does not keep the cards it drops where they can still be reached", () => {
    atWidth(343);
    const { container } = render(
      <CarouselSection title="Recently added" files={twelveFiles} loading={false} />,
    );
    expect(cardCount()).toBe(4);
    expect(container.textContent).not.toContain("Clip 5");
    expect(screen.queryByText("Clip 11")).toBeNull();
  });

  it("draws the floor, not a guess, before it has been measured", () => {
    const { container } = render(
      <CarouselSection title="Recently added" files={twelveFiles} loading={false} />,
    );
    expect(cardCount()).toBe(4);
    expect(
      (container.querySelector("[style]") as HTMLElement).style
        .gridTemplateColumns,
    ).toBe("repeat(auto-fill, minmax(min(16rem, calc(50% - 6px)), 1fr))");
  });

  it("holds the same floor for the watch-history shelf", () => {
    atWidth(343);
    render(
      <ContinueWatchingSection
        items={Array.from({ length: 8 }, (_, i) => ({
          ...watchItem,
          id: `file-${i}`,
          title: `Clip ${i}`,
        }))}
        loading={false}
      />,
    );
    expect(cardCount()).toBe(4);
  });
});

describe("`See all` says how much is past the edge", () => {
  it("carries the count when the caller knows it", () => {
    atWidth(1480);
    render(
      <CarouselSection
        title="Recently added"
        files={twelveFiles}
        loading={false}
        seeAllHref="/drive/main?view=recent-added"
        totalCount={619}
      />,
    );
    expect(screen.getByRole("link", { name: "See all (619)" })).toBeInTheDocument();
  });

  it("stays unqualified when it does not", () => {
    atWidth(1480);
    render(
      <CarouselSection
        title="Recently added"
        files={twelveFiles}
        loading={false}
        seeAllHref="/drive/main?view=recent-added"
      />,
    );
    expect(screen.getByRole("link", { name: "See all" })).toBeInTheDocument();
  });

  it("says nothing rather than zero when the fetch failed", () => {
    atWidth(1480);
    render(
      <CarouselSection
        title="Recently added"
        files={twelveFiles}
        loading={false}
        seeAllHref="/drive/main?view=recent-added"
        totalCount={undefined}
      />,
    );
    expect(screen.queryByText(/See all \(/)).toBeNull();
  });
});
