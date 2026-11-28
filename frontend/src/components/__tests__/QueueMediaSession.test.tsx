/**
 * SPEC-CORE-190 step 7 / I3: on a queue page the system's next and previous
 * track controls use the queue's rules; off one they do what they did.
 */
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";
import type { QueuePageState } from "@/components/queue/QueuePageContext";

const setupMediaSession = vi.fn((..._args: unknown[]) => () => {});
vi.mock("@/lib/mediaSession", () => ({
  setupMediaSession: (...args: unknown[]) => setupMediaSession(...(args as [])),
}));

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
  getWatchProgress: vi.fn().mockResolvedValue({ position: 0, duration: 0 }),
  deleteWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: "Alice",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

import { AudioPlayer } from "../AudioPlayer";
import { QueuePageProvider } from "../queue/QueuePageContext";

const FILE: FileItem = {
  image_width: null,
  image_height: null,
  id: "audio-1",
  filename: "song.mp3",
  title: "Test Song",
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "audio",
  mime_type: "audio/mp3",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 5000000,
  duration: 180,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  modified_at: null,
};

function queueState(overrides: Partial<QueuePageState> = {}): QueuePageState {
  return {
    replacesTrail: true,
    name: "Road Trip",
    href: "/drive/main/collections/c1",
    prevId: "a0",
    nextId: "a2",
    position: 2,
    total: 3,
    navigatePrev: vi.fn(),
    navigateNext: vi.fn(),
    onEnded: vi.fn(),
    previousTrack: vi.fn(),
    ...overrides,
  };
}

function handlers() {
  expect(setupMediaSession).toHaveBeenCalled();
  return setupMediaSession.mock.calls[0][2] as {
    onNextTrack?: () => void;
    onPreviousTrack?: () => void;
  };
}

beforeEach(() => {
  setupMediaSession.mockClear();
});

describe("SPEC-CORE-190 I3 the system's track controls", () => {
  it("on a queue page, next runs the advance and previous the previous playable item", async () => {
    const queue = queueState();
    render(
      <QueuePageProvider value={queue}>
        <AudioPlayer file={FILE} />
      </QueuePageProvider>,
    );

    await waitFor(() => expect(setupMediaSession).toHaveBeenCalled());
    const controls = handlers();
    act(() => controls.onNextTrack?.());
    act(() => controls.onPreviousTrack?.());

    expect(queue.onEnded).toHaveBeenCalledTimes(1);
    expect(queue.previousTrack).toHaveBeenCalledTimes(1);
  });

  it("off a queue page, next stays the file's own ended handler and previous is not registered", async () => {
    const onEnded = vi.fn();
    render(<AudioPlayer file={FILE} onEnded={onEnded} />);

    await waitFor(() => expect(setupMediaSession).toHaveBeenCalled());
    const controls = handlers();
    act(() => controls.onNextTrack?.());

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(controls.onPreviousTrack).toBeUndefined();
  });
});
