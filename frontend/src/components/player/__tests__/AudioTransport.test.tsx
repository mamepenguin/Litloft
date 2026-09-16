import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { AudioTransport, PLAYBACK_RATES } from "../AudioTransport";
import type { MediaController } from "@/lib/mediaController";
import { MEDIA_CLOCK_IDLE_MS } from "@/lib/mediaClock";

/** A controller whose readings the test sets, and whose calls it records. */
function makeController(initial: { time?: number; duration?: number; paused?: boolean; rate?: number } = {}) {
  const state = { time: 0, duration: 180, paused: true, rate: 1, ...initial };
  const mc = {
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    toggleMute: vi.fn(),
    toggleFullscreen: vi.fn(),
    getCurrentTime: () => state.time,
    getDuration: () => state.duration,
    isPaused: () => state.paused,
    isMuted: () => false,
    getVolume: () => 1,
    setVolume: vi.fn(),
    getPlaybackRate: () => state.rate,
    setPlaybackRate: vi.fn(),
    getBufferedFraction: () => 0,
  } satisfies MediaController;
  return { mc, state };
}

const slider = () => screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
const speed = () => screen.getByRole("button", { name: "Playback speed" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function tickClock() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MEDIA_CLOCK_IDLE_MS);
  });
}

describe("AudioTransport", () => {
  it("offers play while paused and pause while playing", async () => {
    const { mc, state } = makeController({ paused: true });
    render(<AudioTransport mc={mc} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    state.paused = false;
    await tickClock();

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("toggles playback on press", () => {
    const { mc } = makeController();
    render(<AudioTransport mc={mc} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(mc.togglePlay).toHaveBeenCalledOnce();
  });

  it("follows the drag and seeks once it is let go", async () => {
    const { mc } = makeController({ time: 10 });
    render(<AudioTransport mc={mc} />);
    await tickClock();

    fireEvent.change(slider(), { target: { value: "90" } });
    expect(slider().value).toBe("90");
    expect(mc.seek).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider());
    expect(mc.seek).toHaveBeenCalledWith(90);
  });

  /** Left scrubbing, the bar would stop following playback for good. */
  it("goes back to following playback when a drag is taken over", async () => {
    const { mc, state } = makeController({ time: 10, paused: false });
    render(<AudioTransport mc={mc} />);
    await tickClock();

    fireEvent.change(slider(), { target: { value: "90" } });
    fireEvent.pointerCancel(slider());

    state.time = 12;
    await tickClock();

    expect(slider().value).toBe("12");
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("goes back to following playback when the bar loses focus mid-drag", async () => {
    const { mc, state } = makeController({ time: 10, paused: false });
    render(<AudioTransport mc={mc} />);
    await tickClock();

    fireEvent.change(slider(), { target: { value: "90" } });
    fireEvent.blur(slider());

    state.time = 12;
    await tickClock();

    expect(slider().value).toBe("12");
    expect(mc.seek).not.toHaveBeenCalled();
  });

  it("cannot be dragged before the length is known", () => {
    const { mc } = makeController({ duration: 0 });
    render(<AudioTransport mc={mc} />);

    expect(slider()).toBeDisabled();
  });

  it("steps through the speeds in order", () => {
    const { mc } = makeController();
    render(<AudioTransport mc={mc} />);

    fireEvent.click(speed());
    fireEvent.click(speed());

    expect(mc.setPlaybackRate).toHaveBeenNthCalledWith(1, 1.25);
    expect(mc.setPlaybackRate).toHaveBeenNthCalledWith(2, 1.5);
  });

  /** Paused, nothing re-renders with the new rate unless it is shown at once. */
  it("shows the chosen speed at once, even while paused", () => {
    const { mc } = makeController({ paused: true });
    render(<AudioTransport mc={mc} />);

    fireEvent.click(speed());

    expect(speed()).toHaveTextContent("1.25x");
  });

  it("corrects the speed shown to what the player reports", async () => {
    const { mc, state } = makeController({ paused: false });
    render(<AudioTransport mc={mc} />);
    fireEvent.click(speed());

    // The player settled on something else.
    state.rate = 1.5;
    state.time = 3;
    await tickClock();

    expect(speed()).toHaveTextContent("1.5x");
  });

  /** The player still reports the old rate for a moment after each press. */
  it("keeps stepping forward while the player catches up", async () => {
    const { mc, state } = makeController({ paused: false });
    render(<AudioTransport mc={mc} />);

    fireEvent.click(speed());
    state.time = 1;
    await tickClock();
    expect(speed()).toHaveTextContent("1.25x");

    fireEvent.click(speed());
    state.time = 2;
    await tickClock();
    expect(speed()).toHaveTextContent("1.5x");

    state.rate = 1.25;
    state.time = 3;
    await tickClock();
    expect(speed()).toHaveTextContent("1.5x");

    state.rate = 1.5;
    state.time = 4;
    await tickClock();
    expect(speed()).toHaveTextContent("1.5x");
    expect(mc.setPlaybackRate.mock.calls).toEqual([[1.25], [1.5]]);
  });

  it("follows the player again once it reports the chosen speed", async () => {
    const { mc, state } = makeController({ paused: false });
    render(<AudioTransport mc={mc} />);
    fireEvent.click(speed());

    state.rate = 1.25;
    state.time = 1;
    await tickClock();
    // Changed elsewhere, such as from the lock screen.
    state.rate = 1;
    state.time = 2;
    await tickClock();

    expect(speed()).toHaveTextContent("1x");
  });

  it("follows the player after stepping all the way round", async () => {
    const { mc, state } = makeController({ paused: false });
    render(<AudioTransport mc={mc} />);
    for (let i = 0; i < PLAYBACK_RATES.length; i++) fireEvent.click(speed());
    expect(speed()).toHaveTextContent("1x");

    state.time = 1;
    await tickClock();
    state.rate = 1.5;
    state.time = 2;
    await tickClock();

    expect(speed()).toHaveTextContent("1.5x");
  });

  describe("when the file cannot be loaded", () => {
    it("says so", () => {
      const { mc } = makeController();
      render(<AudioTransport mc={mc} failed />);

      expect(screen.getByRole("alert")).toHaveTextContent("Could not load this file");
    });

    it("offers nothing to press", () => {
      const { mc } = makeController({ duration: 180 });
      render(<AudioTransport mc={mc} failed />);

      expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
      expect(slider()).toBeDisabled();
      expect(speed()).toBeDisabled();
    });

    it("says nothing while the file is fine", () => {
      const { mc } = makeController();
      render(<AudioTransport mc={mc} />);

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    });
  });

  it("does nothing without a controller", () => {
    render(<AudioTransport mc={null} />);

    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(speed()).toBeDisabled();
  });
});
