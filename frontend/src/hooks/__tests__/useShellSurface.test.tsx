import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";

import type { MediaChannel } from "@/lib/nativeMedia";
import type { SurfaceGeometry } from "@/lib/nativeBridge";
import { useShellSurface } from "../useShellSurface";

let frames: FrameRequestCallback[] = [];
function nextFrame(count = 1) {
  for (let i = 0; i < count; i++) {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  }
}

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloftShell?: { version?: number };
}
let posted: Record<string, unknown>[] = [];

function fakeChannel() {
  return { setSurface: vi.fn<(geometry: SurfaceGeometry | null) => void>() };
}

let box = { x: 0, y: 104, width: 390, height: 219 };
function Player({ channel, show = true }: { channel: MediaChannel | null; show?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useShellSurface(ref, channel);
  return (
    <div data-testid="page" style={{ backgroundColor: "rgb(1, 2, 3)" }}>
      <div data-testid="column" className="bg-bg-primary">
        {show && (
          <div
            data-testid="frame"
            ref={(element) => {
              ref.current = element;
              if (element) {
                element.getBoundingClientRect = () =>
                  ({ ...box, top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height }) as DOMRect;
              }
            }}
          />
        )}
      </div>
      <header data-testid="header" style={{ backgroundColor: "rgb(4, 5, 6)" }} />
    </div>
  );
}

beforeEach(() => {
  frames = [];
  box = { x: 0, y: 104, width: 390, height: 219 };
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frames = [];
  });
  posted = [];
  (window as StubbedWindow).__litloftShell = { version: 2 };
  (window as StubbedWindow).webkit = {
    messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body as Record<string, unknown>) } },
  };
  document.documentElement.style.setProperty("--bg-primary", "#1a0e10");
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as StubbedWindow).webkit;
  delete (window as StubbedWindow).__litloftShell;
  document.documentElement.style.removeProperty("--bg-primary");
});

describe("useShellSurface", () => {
  it("sends where the frame is once, and not again while the page only scrolls", () => {
    const channel = fakeChannel();
    render(<Player channel={channel as unknown as MediaChannel} />);

    nextFrame();
    expect(channel.setSurface).toHaveBeenCalledTimes(1);
    expect(channel.setSurface.mock.calls[0][0]).toMatchObject({ anchor: "document", top: 104, width: 390 });

    Object.defineProperty(window, "scrollY", { value: 80, configurable: true });
    box = { ...box, y: 24 };
    nextFrame(40);
    expect(channel.setSurface).toHaveBeenCalledTimes(1);
  });

  it("sends again when the layout moves the frame or resizes it", () => {
    const channel = fakeChannel();
    render(<Player channel={channel as unknown as MediaChannel} />);
    nextFrame();

    box = { ...box, y: 150 };
    nextFrame();
    expect(channel.setSurface).toHaveBeenLastCalledWith(expect.objectContaining({ top: 150 }));

    box = { ...box, width: 800, height: 450 };
    nextFrame();
    expect(channel.setSurface).toHaveBeenLastCalledWith(expect.objectContaining({ width: 800, height: 450 }));
    expect(channel.setSurface).toHaveBeenCalledTimes(3);
  });

  it("says there is no frame once it goes, and nothing when there never was one", () => {
    const channel = fakeChannel();
    const { rerender } = render(<Player channel={channel as unknown as MediaChannel} />);
    nextFrame();

    rerender(<Player channel={channel as unknown as MediaChannel} show={false} />);
    nextFrame(3);
    expect(channel.setSurface).toHaveBeenLastCalledWith(null);
    expect(channel.setSurface).toHaveBeenCalledTimes(2);
  });

  it("makes only the frame's ancestors see-through, and puts them back", () => {
    const channel = fakeChannel();
    const { getByTestId, rerender, unmount } = render(<Player channel={channel as unknown as MediaChannel} />);
    nextFrame();

    expect(getByTestId("page").style.getPropertyValue("background-color")).toBe("transparent");
    expect(getByTestId("column").style.getPropertyValue("background-color")).toBe("transparent");
    expect(document.body.style.getPropertyValue("background-color")).toBe("transparent");
    expect(getByTestId("header").style.backgroundColor).toBe("rgb(4, 5, 6)");

    rerender(<Player channel={channel as unknown as MediaChannel} show={false} />);
    nextFrame();
    expect(getByTestId("page").style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(getByTestId("column").style.getPropertyValue("background-color")).toBe("");

    rerender(<Player channel={channel as unknown as MediaChannel} />);
    nextFrame();
    unmount();
    expect(document.body.style.getPropertyValue("background-color")).toBe("");
  });

  it("tells the shell the page's colour, and again when it changes", () => {
    render(<Player channel={fakeChannel() as unknown as MediaChannel} />);
    nextFrame(3);
    expect(posted.filter((m) => m.type === "page.background")).toEqual([
      { type: "page.background", color: "#1a0e10" },
    ]);

    document.documentElement.style.setProperty("--bg-primary", "#ffffff");
    nextFrame();
    expect(posted.filter((m) => m.type === "page.background").map((m) => m.color)).toEqual(["#1a0e10", "#ffffff"]);
  });

  it("does nothing outside the shell", () => {
    const { getByTestId } = render(<Player channel={null} />);
    nextFrame(3);
    expect(frames).toEqual([]);
    expect(getByTestId("page").style.backgroundColor).toBe("rgb(1, 2, 3)");
  });
});
