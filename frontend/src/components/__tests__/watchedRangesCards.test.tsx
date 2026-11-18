// SPEC-CORE-141: the card bar fills the watched ranges and marks the resume point (I8).
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { WatchHistoryItem } from "@/types";
import type { ShelfItem } from "@/lib/api";

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

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    deleteWatchProgress: vi.fn(() => Promise.resolve()),
    renameFile: vi.fn(() => Promise.resolve({})),
    moveFile: vi.fn(() => Promise.resolve({})),
    deleteFile: vi.fn(() => Promise.resolve()),
    getDownloadUrl: vi.fn((id: string) => `/api/files/${id}/download`),
    getThumbnailUrl: vi.fn((id: string) => `/api/files/${id}/thumbnail`),
  };
});

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../RenameDialog", () => ({ RenameDialog: () => null }));
vi.mock("../MoveDialog", () => ({ MoveDialog: () => null }));
vi.mock("../ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("../CollectionPicker", () => ({ CollectionPicker: () => null }));

import { ContinueWatchingSection } from "../ContinueWatchingSection";
import { VideoCard } from "../videoapp/VideoCard";

interface Range {
  start: number;
  end: number;
}

interface Progress {
  position: number;
  duration: number;
}

const base: WatchHistoryItem = {
  image_width: null,
  image_height: null,
  id: "file-1",
  filename: "video1.mp4",
  title: "Video One",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/file-1/thumbnail",
  has_thumbnail: true,
  file_size: 1024,
  duration: 100,
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
  watch_progress: { position: 40, duration: 100 },
};

type Card = "FileCard" | "VideoCard";

function renderCard(card: Card, progress: Progress | undefined, ranges?: Range[]) {
  const extra: Record<string, unknown> = {};
  if (progress) extra.watch_progress = progress;
  if (ranges) extra.watched_ranges = ranges;
  if (card === "FileCard") {
    const item = { ...base, ...extra } as WatchHistoryItem;
    if (!progress) delete (item as Partial<WatchHistoryItem>).watch_progress;
    return render(<ContinueWatchingSection items={[item]} loading={false} />);
  }
  const { watch_progress: _ignored, ...file } = base;
  const item = { ...file, ...extra } as ShelfItem;
  return render(<VideoCard item={item} />);
}

/**
 * Test contract: each filled range is `[data-testid="watched-range"]` and
 * the tick is `[data-testid="resume-tick"]`, both placed with an inline
 * `left` (and, for a range, `width`) whose percentage is the fraction of the bar
 * (`calc()` around it is allowed; centring belongs to a transform or offset).
 */
function percent(value: string): number {
  const m = /(-?[0-9.]+)%/.exec(value);
  if (!m) throw new Error(`no percentage in "${value}"`);
  return Number(m[1]);
}

function fills(container: HTMLElement): Array<[number, number]> {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="watched-range"]'))
    .map((el): [number, number] => {
      const left = percent(el.style.left);
      return [left, left + percent(el.style.width)];
    })
    .sort((a, b) => a[0] - b[0]);
}

function tickAt(container: HTMLElement): number | null {
  const tick = container.querySelector<HTMLElement>('[data-testid="resume-tick"]');
  return tick ? percent(tick.style.left) : null;
}

function expectFills(container: HTMLElement, expected: Array<[number, number]>) {
  const got = fills(container);
  expect(got).toHaveLength(expected.length);
  got.forEach(([s, e], i) => {
    expect(s).toBeCloseTo(expected[i][0], 3);
    expect(e).toBeCloseTo(expected[i][1], 3);
  });
}

const CARDS: Card[] = ["FileCard", "VideoCard"];

describe.each(CARDS)("SPEC-CORE-141 %s bar", (card) => {
  it("SPEC-CORE-141 fills exactly the watched ranges, as fractions of the duration", () => {
    const { container } = renderCard(card, { position: 40, duration: 100 }, [
      { start: 0, end: 15 },
      { start: 25, end: 30 },
      { start: 95, end: 100 },
    ]);
    expectFills(container, [
      [0, 15],
      [25, 30],
      [95, 100],
    ]);
  });

  it("SPEC-CORE-141 uses watch_progress.duration, not the file's duration", () => {
    const { container } = renderCard(card, { position: 40, duration: 200 }, [
      { start: 50, end: 100 },
    ]);
    expectFills(container, [[25, 50]]);
    expect(tickAt(container)).toBeCloseTo(20, 3);
  });

  it("SPEC-CORE-141 clamps a range to the bar", () => {
    const { container } = renderCard(card, { position: 40, duration: 100 }, [
      { start: 90, end: 105 },
    ]);
    expectFills(container, [[90, 100]]);
  });

  it.each([
    [5, "none"],
    [5.25, 5.25],
    [50, 50],
    [94.75, 94.75],
    [95, "none"],
    [0, "none"],
  ] as Array<[number, number | "none"]>)(
    "SPEC-CORE-141 with ranges, position %s of 100 draws the tick at: %s",
    (position, expected) => {
      const { container } = renderCard(card, { position, duration: 100 }, [
        { start: 0, end: 15 },
      ]);
      expectFills(container, [[0, 15]]);
      const at = tickAt(container);
      if (expected === "none") expect(at).toBeNull();
      else expect(at).toBeCloseTo(expected, 3);
    },
  );

  it.each([
    ["empty", [] as Range[]],
    ["absent", undefined],
  ])(
    "SPEC-CORE-141 with %s ranges it draws today's bar and no tick, and with ranges it does not",
    (_label, ranges) => {
      const today = renderCard(card, { position: 40, duration: 100 }, ranges);
      expect(fills(today.container)).toEqual([]);
      expect(tickAt(today.container)).toBeNull();
      const widths = Array.from(
        today.container.querySelectorAll<HTMLElement>('[style*="width"]'),
      ).map((el) => el.style.width);
      expect(widths).toEqual(["40%"]);
      today.unmount();

      const watched = renderCard(card, { position: 40, duration: 100 }, [{ start: 0, end: 15 }]);
      expectFills(watched.container, [[0, 15]]);
      expect(tickAt(watched.container)).toBeCloseTo(40, 3);
    },
  );

  it("SPEC-CORE-141 with a zero duration there is no bar, whatever the ranges", () => {
    const none = renderCard(card, { position: 40, duration: 0 }, [{ start: 0, end: 15 }]);
    expect(fills(none.container)).toEqual([]);
    expect(tickAt(none.container)).toBeNull();
    expect(none.container.querySelectorAll('[style*="width"]')).toHaveLength(0);
    none.unmount();

    const some = renderCard(card, { position: 40, duration: 100 }, [{ start: 0, end: 15 }]);
    expectFills(some.container, [[0, 15]]);
  });
});
