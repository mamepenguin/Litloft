import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

import { ChaptersPanel, activeChapterIndex } from "../ChaptersPanel";
import * as api from "@/lib/api";
import type { MediaController } from "@/lib/mediaController";

vi.mock("@/lib/api", () => ({
  getFileChapters: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// The clock is C-0's shared poller. Driving it directly keeps this test
// about the panel: which chapter is current for a given position, not
// how the position is observed.
const clock = vi.hoisted(() => ({ currentTime: 0 }));
vi.mock("@/lib/mediaClock", () => ({
  useMediaClock: () => ({
    currentTime: clock.currentTime,
    duration: 600,
    paused: false,
    interrupted: false,
  }),
}));

function chapter(start: number, title: string, ordering: number) {
  return { start_time: start, end_time: null, title, ordering };
}

const CHAPTERS = [
  chapter(0, "Intro", 0),
  chapter(60, "Setup", 1),
  chapter(180, "The point", 2),
];

function mockChapters(chapters = CHAPTERS) {
  (api.getFileChapters as ReturnType<typeof vi.fn>).mockResolvedValue({
    chapters,
    source: "extracted",
  });
}

function makeController(): MediaController {
  return {
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
  } as unknown as MediaController;
}

describe("activeChapterIndex", () => {
  it("is -1 before the first chapter starts", () => {
    expect(activeChapterIndex([chapter(5, "Late", 0)], 0)).toBe(-1);
  });

  it("is the last chapter that has started", () => {
    expect(activeChapterIndex(CHAPTERS, 0)).toBe(0);
    expect(activeChapterIndex(CHAPTERS, 59.9)).toBe(0);
    expect(activeChapterIndex(CHAPTERS, 60)).toBe(1);
    expect(activeChapterIndex(CHAPTERS, 10_000)).toBe(2);
  });

  it("does not need end_time to answer", () => {
    // Producers may not state one. A range test would report "no
    // chapter" for a position the file is plainly inside.
    const open = [chapter(0, "Only", 0)];
    expect(activeChapterIndex(open, 12_345)).toBe(0);
  });

  it("does not assume the list ascends with time", () => {
    // Display order is `ordering`, which the schema keeps so a producer
    // can commit an order of its own. Stopping at the first future start
    // reports the wrong chapter for any set where the two disagree.
    const shuffled = [
      chapter(180, "Third", 0),
      chapter(0, "First", 1),
      chapter(60, "Second", 2),
    ];
    expect(activeChapterIndex(shuffled, 200)).toBe(0);
    expect(activeChapterIndex(shuffled, 90)).toBe(2);
    expect(activeChapterIndex(shuffled, 10)).toBe(1);
    expect(activeChapterIndex(shuffled, -1)).toBe(-1);
  });
});

describe("ChaptersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clock.currentTime = 0;
  });

  it("renders nothing when the file has no chapters", async () => {
    mockChapters([]);
    const { container } = render(
      <ChaptersPanel fileId="f1" mediaController={makeController()} />,
    );
    await waitFor(() => expect(api.getFileChapters).toHaveBeenCalledWith("f1"));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the chapters cannot be read", async () => {
    // Must not take the player or the transcript down with it.
    (api.getFileChapters as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    const { container } = render(
      <ChaptersPanel fileId="f1" mediaController={makeController()} />,
    );
    await waitFor(() => expect(api.getFileChapters).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the chapter the playhead is inside", async () => {
    mockChapters();
    clock.currentTime = 200;
    render(<ChaptersPanel fileId="f1" mediaController={makeController()} />);

    await waitFor(() => screen.getByText("The point"));
    const current = screen.getByRole("button", { name: /The point/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: /Intro/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("advances with the clock", async () => {
    mockChapters();
    const { rerender } = render(
      <ChaptersPanel fileId="f1" mediaController={makeController()} />,
    );
    await waitFor(() => screen.getByText("Setup"));
    expect(screen.getByRole("button", { name: /Intro/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    act(() => {
      clock.currentTime = 100;
    });
    rerender(<ChaptersPanel fileId="f1" mediaController={makeController()} />);

    expect(screen.getByRole("button", { name: /Setup/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("seeks through the controller, with no backend branch", async () => {
    mockChapters();
    const mc = makeController();
    render(<ChaptersPanel fileId="f1" mediaController={mc} />);

    await waitFor(() => screen.getByText("The point"));
    fireEvent.click(screen.getByRole("button", { name: /The point/ }));

    expect(mc.seek).toHaveBeenCalledWith(180);
  });

  it("collapses to the current chapter's title alone", async () => {
    mockChapters();
    clock.currentTime = 200;
    render(<ChaptersPanel fileId="f1" mediaController={makeController()} />);

    await waitFor(() => screen.getByText("Intro"));
    fireEvent.click(screen.getByRole("button", { expanded: true }));

    // The one thing chapters answer — "where am I" — survives; the rest
    // of the list gives its height back to the transcript.
    expect(screen.getByText("The point")).toBeInTheDocument();
    expect(screen.queryByText("Intro")).toBeNull();
    expect(screen.queryByText("Setup")).toBeNull();
  });

  it("does not repeat the current title in the header while open", async () => {
    // The highlighted row already says where you are, and a header that
    // restates it changes under the reader on every boundary.
    mockChapters();
    clock.currentTime = 200;
    render(<ChaptersPanel fileId="f1" mediaController={makeController()} />);

    await waitFor(() => screen.getByText("chapters"));
    expect(screen.getAllByText("The point")).toHaveLength(1);
  });

  it("falls back to a label before the first chapter starts", async () => {
    mockChapters([chapter(30, "Starts later", 0)]);
    render(<ChaptersPanel fileId="f1" mediaController={makeController()} />);

    await waitFor(() => screen.getByText("Starts later"));
    fireEvent.click(screen.getByRole("button", { expanded: true }));

    expect(screen.getByText("chapters")).toBeInTheDocument();
  });

  it("reports what arrived so the host can fold an empty region", async () => {
    mockChapters();
    const onResolved = vi.fn();
    render(
      <ChaptersPanel
        fileId="f1"
        mediaController={makeController()}
        onResolved={onResolved}
      />,
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(3));
  });

  it("reports zero when the chapters cannot be read", async () => {
    (api.getFileChapters as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    const onResolved = vi.fn();
    render(
      <ChaptersPanel
        fileId="f1"
        mediaController={makeController()}
        onResolved={onResolved}
      />,
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(0));
  });

  it("does not refetch when the host passes a fresh callback each render", async () => {
    // This component re-renders on every clock tick, so an `onResolved`
    // in the effect's dependencies would refetch several times a second.
    mockChapters();
    const { rerender } = render(
      <ChaptersPanel
        fileId="f1"
        mediaController={makeController()}
        onResolved={() => {}}
      />,
    );
    await waitFor(() => expect(api.getFileChapters).toHaveBeenCalledTimes(1));

    rerender(
      <ChaptersPanel
        fileId="f1"
        mediaController={makeController()}
        onResolved={() => {}}
      />,
    );

    expect(api.getFileChapters).toHaveBeenCalledTimes(1);
  });

  it("refetches without remounting when the refresh token changes", async () => {
    mockChapters();
    const controller = makeController();
    const { rerender } = render(
      <ChaptersPanel
        fileId="f1"
        mediaController={controller}
        refreshToken={0}
      />,
    );
    await waitFor(() => expect(api.getFileChapters).toHaveBeenCalledTimes(1));

    rerender(
      <ChaptersPanel
        fileId="f1"
        mediaController={controller}
        refreshToken={1}
      />,
    );

    await waitFor(() => expect(api.getFileChapters).toHaveBeenCalledTimes(2));
  });

  it("stays inert when no controller has been published yet", async () => {
    mockChapters();
    render(<ChaptersPanel fileId="f1" mediaController={null} />);

    await waitFor(() => screen.getByText("Intro"));
    expect(screen.getByRole("button", { name: /Intro/ })).toBeDisabled();
  });
});
