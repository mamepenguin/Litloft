import { useRef, type ReactElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { MediaController } from "@/lib/mediaController";
import { MEDIA_CLOCK_ACTIVE_MS, MEDIA_CLOCK_IDLE_MS } from "@/lib/mediaClock";
import { usePlaybackProgress } from "@/lib/playbackProgress";
import MediaControls from "..";

/**
 * Test contract for the band (the spec names no hook into the DOM):
 * - the band is `[data-testid="watched-band"]`, absent while not shown;
 * - each piece is `[data-testid="watched-piece"]` inside it, placed with an
 *   inline `left` and `width` in percent of the seek line;
 * - a piece's level is its `data-level`, or else the alpha of its inline
 *   `opacity` / white `background-color` (0.35, 0.6, 0.9).
 */
export interface Piece {
  start: number;
  end: number;
  level: number;
}

const ALPHA_LEVEL: Array<[number, number]> = [
  [0.35, 1],
  [0.6, 2],
  [0.9, 3],
];

function levelOf(el: HTMLElement): number {
  if (el.dataset.level) return Number(el.dataset.level);
  let alpha: number | null = null;
  if (el.style.opacity !== "") alpha = Number(el.style.opacity);
  const rgba = /rgba\(\s*255,\s*255,\s*255,\s*([0-9.]+)\s*\)/.exec(el.style.backgroundColor);
  if (rgba) alpha = Number(rgba[1]);
  if (alpha === null) throw new Error("piece carries no level");
  const hit = ALPHA_LEVEL.find(([a]) => Math.abs(a - alpha!) < 0.001);
  if (!hit) throw new Error(`piece alpha ${alpha} is no band level`);
  return hit[1];
}

export function band(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="watched-band"]');
}

/** Pieces as fractions of the seek line, sorted by start. */
export function pieces(): Piece[] {
  const root = band();
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid="watched-piece"]'))
    .map((el) => {
      const left = parseFloat(el.style.left) / 100;
      const width = parseFloat(el.style.width) / 100;
      return { start: left, end: left + width, level: levelOf(el) };
    })
    .sort((a, b) => a.start - b.start);
}

/** Pieces in seconds of a `duration`-long seek line, rounded to 1 ms. */
export function piecesInSeconds(duration: number): Piece[] {
  const r = (x: number) => Math.round(x * duration * 1000) / 1000;
  return pieces().map((p) => ({ start: r(p.start), end: r(p.end), level: p.level }));
}

export interface StubState {
  currentTime: number;
  duration: number;
  paused: boolean;
  interrupted: boolean;
}

export function stubController(overrides: Partial<StubState> = {}) {
  const state: StubState = {
    currentTime: 0,
    duration: 100,
    paused: false,
    interrupted: false,
    ...overrides,
  };
  const mc: MediaController = {
    seek: vi.fn((seconds: number) => {
      state.currentTime = seconds;
    }),
    play: vi.fn(() => {
      state.paused = false;
    }),
    pause: vi.fn(() => {
      state.paused = true;
    }),
    togglePlay: vi.fn(() => {
      state.paused = !state.paused;
    }),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => state.currentTime,
    getDuration: () => state.duration,
    isPaused: () => state.paused,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => 1,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
    isInterrupted: () => state.interrupted,
  };
  return { mc, state };
}

export const TICK_S = MEDIA_CLOCK_ACTIVE_MS / 1000;

export function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

export function tick(times = 1) {
  wait(MEDIA_CLOCK_ACTIVE_MS * times);
}

export async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {});
  }
}

/** Lets the resume read and the band read settle. */
export async function settle() {
  tick();
  await flush();
  tick();
  await flush();
}

export function play(state: StubState, media: number) {
  const n = Math.round(media / TICK_S);
  for (let i = 0; i < n; i++) {
    state.currentTime += TICK_S;
    tick();
  }
}

export function idle() {
  wait(MEDIA_CLOCK_IDLE_MS);
}

export function pagehide() {
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
}

// ---------------------------------------------------------------- fetch

export interface SegmentsAnswer {
  segment_seconds?: number;
  segments: Record<number, number>;
}

export function segmentsResponse(answer: SegmentsAnswer): Response {
  return new Response(
    JSON.stringify({
      segment_seconds: answer.segment_seconds ?? 5,
      segments: Object.entries(answer.segments).map(([index, played]) => ({
        index: Number(index),
        played_seconds: played,
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export function respond(status: number): Response {
  return new Response(null, { status });
}

export const fetchMock =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL)) return input.method.toUpperCase();
  return "GET";
}

/** Every `GET /played-segments`, as the file id it asked for. */
export function segmentReads(): string[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = urlOf(input);
      return url.includes("/played-segments") && methodOf(input, init) === "GET";
    })
    .map(([input]) => /\/api\/files\/([^/]+)\/played-segments/.exec(urlOf(input))?.[1] ?? "");
}

export function rangeSends(): string[] {
  return fetchMock.mock.calls
    .filter(([input]) => urlOf(input).includes("/played-ranges"))
    .map(([input]) => /\/api\/files\/([^/]+)\/played-ranges/.exec(urlOf(input))?.[1] ?? "");
}

export interface Route {
  segments: (fileId: string, n: number) => Promise<Response>;
  ranges: (fileId: string, n: number) => Promise<Response>;
}

/** Routes fetch by URL; `n` counts calls of that kind, from 0. */
export function routeFetch(route: Partial<Route> = {}) {
  let segmentsN = 0;
  let rangesN = 0;
  fetchMock.mockImplementation(async (input) => {
    const url = urlOf(input);
    const segment = /\/api\/files\/([^/]+)\/played-segments/.exec(url);
    if (segment) {
      const n = segmentsN++;
      return route.segments
        ? route.segments(segment[1], n)
        : segmentsResponse({ segments: {} });
    }
    const ranges = /\/api\/files\/([^/]+)\/played-ranges/.exec(url);
    if (ranges) {
      const n = rangesN++;
      return route.ranges ? route.ranges(ranges[1], n) : respond(204);
    }
    return respond(404);
  });
}

/** A response held until the test lets it go. */
export function deferred() {
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------- pointers

/** Hovers the seek bar's row with a pointer of `pointerType`. */
export function hoverSeekRow(pointerType: "mouse" | "pen" | "touch" = "mouse") {
  const seek = screen.getByRole("slider", { name: "Seek" });
  act(() => {
    fireEvent.pointerOver(seek, { pointerType, pointerId: 1 });
    fireEvent.pointerEnter(seek, { pointerType, pointerId: 1 });
    fireEvent.pointerMove(seek, { pointerType, pointerId: 1 });
    if (pointerType !== "touch") {
      fireEvent.mouseOver(seek);
      fireEvent.mouseEnter(seek);
      fireEvent.mouseMove(seek);
    }
  });
}

export function leaveSeekRow(pointerType: "mouse" | "pen" | "touch" = "mouse") {
  const seek = screen.getByRole("slider", { name: "Seek" });
  act(() => {
    fireEvent.pointerOut(seek, { pointerType, pointerId: 1, relatedTarget: document.body });
    fireEvent.pointerLeave(seek, { pointerType, pointerId: 1, relatedTarget: document.body });
    if (pointerType !== "touch") {
      fireEvent.mouseOut(seek, { relatedTarget: document.body });
      fireEvent.mouseLeave(seek, { relatedTarget: document.body });
    }
  });
}

/** Whether the band shows while the seek row is hovered, then leaves the row. */
export function bandOnHover(): Piece[] {
  hoverSeekRow();
  const seen = pieces();
  leaveSeekRow();
  return seen;
}

// ---------------------------------------------------------------- layouts

const realMatchMedia = window.matchMedia;

export function installPointerMode(mode: "coarse" | "fine") {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes(`pointer: ${mode}`),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

export function restoreMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: realMatchMedia,
  });
}

// ---------------------------------------------------------------- page

export interface PageProps {
  mc: MediaController;
  fileId: string;
  host?: boolean;
  controls?: boolean;
  onHostRender?: () => void;
}

function Host({
  mc,
  fileId,
  onHostRender,
}: {
  mc: MediaController;
  fileId: string;
  onHostRender?: () => void;
}): null {
  onHostRender?.();
  usePlaybackProgress({ mc, fileId });
  return null;
}

/**
 * A player page: the host calls `usePlaybackProgress`, and `MediaControls`
 * is drawn beside it with the same controller, as `VideoPlayer` does.
 */
export function Page({ mc, fileId, host = true, controls = true, onHostRender }: PageProps): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={frameRef} data-testid="frame" style={{ position: "relative" }}>
      {host && <Host mc={mc} fileId={fileId} onHostRender={onHostRender} />}
      {controls && <MediaControls mc={mc} frameRef={frameRef} />}
    </div>
  );
}

export function renderPage(props: PageProps) {
  let current = props;
  const utils = render(<Page {...current} />);
  return {
    ...utils,
    update: (next: Partial<PageProps>) => {
      current = { ...current, ...next };
      utils.rerender(<Page {...current} />);
    },
  };
}
