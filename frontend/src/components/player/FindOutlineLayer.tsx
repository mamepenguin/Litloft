"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useFindMarks } from "@/components/FileDetail/find/FindContext";
import { useInMiniPlayerBox } from "@/hooks/useMiniPlayer";
import type { FindRow } from "@/lib/fileFind";
import type { MediaController } from "@/lib/mediaController";
import {
  getMediaClockSnapshot,
  subscribeMediaClock,
  type MediaClockSnapshot,
} from "@/lib/mediaClock";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface NativeSnapshot {
  currentTime: number;
  duration: number;
  ended: boolean;
  width: number;
  height: number;
  interrupted: boolean;
  inPictureInPicture: boolean;
  inElementFullscreen: boolean;
}

const EMPTY_CLOCK: MediaClockSnapshot = Object.freeze({
  currentTime: 0,
  duration: 0,
  paused: true,
  interrupted: false,
});

const NATIVE_EVENTS = [
  "timeupdate",
  "seeked",
  "ended",
  "loadedmetadata",
  "durationchange",
  "play",
  "pause",
  "emptied",
  "webkitbeginfullscreen",
  "webkitendfullscreen",
] as const;

function isQuad(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function rowQuads(row: FindRow): number[][] {
  return Array.isArray(row.boxes) ? row.boxes.filter(isQuad) : [];
}

function usableFrameSize(row: FindRow): [number, number] | null {
  const size = row.frame_size;
  if (!Array.isArray(size) || size.length !== 2) return null;
  const [width, height] = size;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (!(width > 0 && height > 0)) return null;
  return [width, height];
}

function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

function contain(picture: Rect, width: number, height: number): Rect | null {
  if (!(picture.width > 0 && picture.height > 0)) return null;
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(picture.width / width, picture.height / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return {
    left: picture.left + (picture.width - drawnWidth) / 2,
    top: picture.top + (picture.height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  };
}

function outlinesFor(
  rows: FindRow[],
  currentRow: FindRow,
): { marks: number[][]; currents: number[][] } | null {
  const seen = new Map<string, number[]>();
  for (const row of rows) {
    if (row.start !== currentRow.start || row.end !== currentRow.end) continue;
    for (const quad of rowQuads(row)) {
      const key = quad.join(",");
      if (!seen.has(key)) seen.set(key, quad);
    }
  }
  if (seen.size === 0) return null;
  const currentKeys = new Set(rowQuads(currentRow).map((quad) => quad.join(",")));
  const marks: number[][] = [];
  const currents: number[][] = [];
  for (const [key, quad] of seen) {
    if (currentKeys.has(key)) currents.push(quad);
    else marks.push(quad);
  }
  return { marks, currents };
}

function readNative(
  video: HTMLVideoElement,
  controller: MediaController | null,
): NativeSnapshot {
  const displayingFullscreen =
    (video as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
      .webkitDisplayingFullscreen === true;
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    ended: video.ended,
    width: video.videoWidth,
    height: video.videoHeight,
    interrupted: controller?.isInterrupted?.() ?? false,
    inPictureInPicture: document.pictureInPictureElement === video,
    inElementFullscreen:
      document.fullscreenElement === video || displayingFullscreen,
  };
}

function useNativeSnapshot(
  video: HTMLVideoElement | null,
  controller: MediaController | null,
): NativeSnapshot | null {
  const [snapshot, setSnapshot] = useState<NativeSnapshot | null>(() =>
    video ? readNative(video, controller) : null,
  );

  useEffect(() => {
    if (!video) {
      setSnapshot(null);
      return;
    }
    const update = () => setSnapshot(readNative(video, controller));
    update();
    for (const event of NATIVE_EVENTS) video.addEventListener(event, update);
    document.addEventListener("enterpictureinpicture", update);
    document.addEventListener("leavepictureinpicture", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      for (const event of NATIVE_EVENTS) {
        video.removeEventListener(event, update);
      }
      document.removeEventListener("enterpictureinpicture", update);
      document.removeEventListener("leavepictureinpicture", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, [video, controller]);

  return snapshot;
}

/**
 * Follows the shared clock only while `active`, so a player with nothing to
 * outline keeps the existing pollers as its only consumers.
 */
function useEmbedClock(
  controller: MediaController | null,
  active: boolean,
): MediaClockSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      controller && active
        ? subscribeMediaClock(controller, onStoreChange)
        : () => {},
    [controller, active],
  );
  const getSnapshot = useCallback(
    () =>
      controller && active
        ? getMediaClockSnapshot(controller)
        : EMPTY_CLOCK,
    [controller, active],
  );
  const getServerSnapshot = useCallback(() => EMPTY_CLOCK, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function OutlinePolygon({ quad, current }: { quad: number[]; current: boolean }) {
  const points: string[] = [];
  for (let i = 0; i < quad.length; i += 2) {
    points.push(`${quad[i]},${quad[i + 1]}`);
  }
  return (
    <polygon
      data-find-box={current ? "current" : "mark"}
      className={current ? "find-box find-box-current" : "find-box"}
      points={points.join(" ")}
    />
  );
}

export interface FindOutlineLayerProps {
  /**
   * A native video. Its own box is the picture box, and its own events are
   * the time; without it the layer follows `controller` and the current
   * row's `frame_size`, and its own box is the picture box.
   */
  video?: HTMLVideoElement | null;
  /** The embed's controller: the shared clock and the interruption state. */
  controller?: MediaController | null;
}

export function FindOutlineLayer({ video, controller = null }: FindOutlineLayerProps) {
  const { term, currentRow, rows } = useFindMarks();
  const inMiniPlayer = useInMiniPlayerBox();
  const containerRef = useRef<HTMLDivElement>(null);
  const native = video != null;
  const nativeSnapshot = useNativeSnapshot(video ?? null, controller);
  const currentHasBoxes = currentRow != null && rowQuads(currentRow).length > 0;
  const clock = useEmbedClock(
    native ? null : controller,
    !native && currentHasBoxes,
  );

  const [origin, setOrigin] = useState<Rect | null>(null);
  const [pictureBox, setPictureBox] = useState<Rect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const target = video ?? container;
    if (!container || !target) return;
    const measure = () => {
      setOrigin(rectOf(container));
      setPictureBox(rectOf(target));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (target !== container) observer.observe(target);
    return () => observer.disconnect();
  }, [video]);

  const scene =
    currentHasBoxes && currentRow
      ? outlinesFor(rows, currentRow)
      : null;

  const painted = useMemo(() => {
    if (!pictureBox) return null;
    if (native) {
      if (!nativeSnapshot) return null;
      return contain(pictureBox, nativeSnapshot.width, nativeSnapshot.height);
    }
    if (!currentRow) return null;
    const size = usableFrameSize(currentRow);
    if (!size) return null;
    return contain(pictureBox, size[0], size[1]);
  }, [native, nativeSnapshot, pictureBox, currentRow]);

  const time = native ? nativeSnapshot?.currentTime : clock.currentTime;
  const duration = native ? nativeSnapshot?.duration : clock.duration;
  const interrupted = native
    ? (nativeSnapshot?.interrupted ?? false)
    : clock.interrupted;
  const ended = native
    ? (nativeSnapshot?.ended ?? true) ||
      !(time != null && duration != null && time < duration)
    : clock.duration > 0 && !(clock.currentTime < clock.duration);
  const hiddenForWindow =
    native
      ? (nativeSnapshot?.inPictureInPicture ?? false) ||
        (nativeSnapshot?.inElementFullscreen ?? false)
      : false;

  const inSegment =
    currentRow != null &&
    typeof currentRow.start === "number" &&
    typeof currentRow.end === "number" &&
    time != null &&
    time >= currentRow.start - 0.5 &&
    time < currentRow.end;

  const show =
    term !== null &&
    scene !== null &&
    inSegment &&
    !ended &&
    !interrupted &&
    !inMiniPlayer &&
    !hiddenForWindow &&
    painted !== null &&
    origin !== null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-frame-outline=""
      className="pointer-events-none absolute inset-0"
    >
      {show && scene && painted && origin ? (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: `${painted.left - origin.left}px`,
            top: `${painted.top - origin.top}px`,
            width: `${painted.width}px`,
            height: `${painted.height}px`,
            pointerEvents: "none",
          }}
        >
          {scene.marks.map((quad, index) => (
            <OutlinePolygon key={`mark-${index}`} quad={quad} current={false} />
          ))}
          {scene.currents.map((quad, index) => (
            <OutlinePolygon key={`current-${index}`} quad={quad} current />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
