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
  drive,
}: {
  events: string[];
  onMatch: () => void;
  initialEvent: WebSocketEvent | null;
  setEvent: (setter: (next: WebSocketEvent | null) => void) => void;
  drive?: string;
}) {
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(initialEvent);
  setEvent((next) => setLastEvent(next));
  return (
    <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
      <Probe events={events} onMatch={onMatch} drive={drive} />
    </WebSocketContext.Provider>
  );
}

function Probe({
  events,
  onMatch,
  drive,
}: {
  events: string[];
  onMatch: () => void;
  drive?: string;
}): ReactNode {
  useWebSocketRefresh(events, onMatch, drive);
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

  describe("drive scoping", () => {
    function fire(
      drive: string | undefined,
      payloadDrive: unknown,
      onMatch: () => void,
    ) {
      let setter: (next: WebSocketEvent | null) => void = () => {};
      render(
        <Harness
          events={["drive.structure_changed"]}
          onMatch={onMatch}
          initialEvent={null}
          drive={drive}
          setEvent={(s) => {
            setter = s;
          }}
        />,
      );
      act(() => {
        setter({
          event: "drive.structure_changed",
          data: payloadDrive === undefined ? {} : { drive: payloadDrive },
        });
      });
      return setter;
    }

    it("fires for an event on the subscribed drive", async () => {
      const onMatch = vi.fn();
      fire("photos", "photos", onMatch);
      await flushMicrotasks();
      expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("ignores an event for a different drive", async () => {
      const onMatch = vi.fn();
      fire("photos", "movies", onMatch);
      await flushMicrotasks();
      // Two public drives are both deliverable, so the access filter does
      // not save us here — refetching another drive's listing is waste.
      expect(onMatch).not.toHaveBeenCalled();
    });

    it("fires when the payload carries no drive", async () => {
      const onMatch = vi.fn();
      fire("photos", undefined, onMatch);
      await flushMicrotasks();
      // Never drop a refresh over a payload shape we did not expect: a
      // missed update is visible to the user, a spare refetch is not.
      expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("fires for every drive when no drive is given", async () => {
      const onMatch = vi.fn();
      fire(undefined, "movies", onMatch);
      await flushMicrotasks();
      expect(onMatch).toHaveBeenCalledTimes(1);
    });
  });
});
