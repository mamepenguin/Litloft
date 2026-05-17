import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { useWebSocketRefresh } from "../useWebSocketRefresh";
import type { WebSocketEvent } from "@/types";

// Test harness: a controllable WS context provider plus a probe
// component that calls the hook and counts callback invocations.
function Harness({
  events,
  onMatch,
  initialEvent,
  setEvent,
}: {
  events: string[];
  onMatch: () => void;
  initialEvent: WebSocketEvent | null;
  setEvent: (setter: (next: WebSocketEvent | null) => void) => void;
}) {
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(initialEvent);
  setEvent((next) => setLastEvent(next));
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <Probe events={events} onMatch={onMatch} />
    </WebSocketContext.Provider>
  );
}

function Probe({
  events,
  onMatch,
}: {
  events: string[];
  onMatch: () => void;
}): ReactNode {
  useWebSocketRefresh(events, onMatch);
  return null;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useWebSocketRefresh", () => {
  it("does not fire when no event has arrived", async () => {
    const onMatch = vi.fn();
    let setter: (next: WebSocketEvent | null) => void = () => {};
    render(
      <Harness
        events={["files.moved"]}
        onMatch={onMatch}
        initialEvent={null}
        setEvent={(s) => {
          setter = s;
        }}
      />,
    );
    await flushMicrotasks();
    void setter;
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("fires once for a matching event", async () => {
    const onMatch = vi.fn();
    let setter: (next: WebSocketEvent | null) => void = () => {};
    render(
      <Harness
        events={["files.moved"]}
        onMatch={onMatch}
        initialEvent={null}
        setEvent={(s) => {
          setter = s;
        }}
      />,
    );
    await act(async () => {
      setter({ event: "files.moved", data: { file_ids: ["a"] } });
      await flushMicrotasks();
    });
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("ignores events that don't match the filter", async () => {
    const onMatch = vi.fn();
    let setter: (next: WebSocketEvent | null) => void = () => {};
    render(
      <Harness
        events={["files.moved"]}
        onMatch={onMatch}
        initialEvent={null}
        setEvent={(s) => {
          setter = s;
        }}
      />,
    );
    await act(async () => {
      setter({ event: "scan.progress", data: { drive: "x" } });
      await flushMicrotasks();
    });
    expect(onMatch).not.toHaveBeenCalled();
  });

  it("matches across multiple event names", async () => {
    const onMatch = vi.fn();
    let setter: (next: WebSocketEvent | null) => void = () => {};
    render(
      <Harness
        events={["files.moved", "folders.created"]}
        onMatch={onMatch}
        initialEvent={null}
        setEvent={(s) => {
          setter = s;
        }}
      />,
    );
    await act(async () => {
      setter({ event: "folders.created", data: { drive: "x", path: "y" } });
      await flushMicrotasks();
    });
    expect(onMatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      setter({ event: "files.moved", data: { file_ids: ["a"] } });
      await flushMicrotasks();
    });
    expect(onMatch).toHaveBeenCalledTimes(2);
  });

  it("coalesces synchronous bursts into a single callback", async () => {
    const onMatch = vi.fn();
    let setter: (next: WebSocketEvent | null) => void = () => {};
    render(
      <Harness
        events={["files.moved"]}
        onMatch={onMatch}
        initialEvent={null}
        setEvent={(s) => {
          setter = s;
        }}
      />,
    );
    await act(async () => {
      // Two events back-to-back inside the same tick should yield one call.
      setter({ event: "files.moved", data: { file_ids: ["a"] } });
      setter({ event: "files.moved", data: { file_ids: ["b"] } });
      await flushMicrotasks();
    });
    expect(onMatch).toHaveBeenCalledTimes(1);
  });
});
