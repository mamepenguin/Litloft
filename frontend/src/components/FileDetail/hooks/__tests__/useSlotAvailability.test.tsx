/**
 * The per-file "have I anything" answers a slot entry gives core.
 *
 * No addon is named here. The hook takes entry ids as opaque strings —
 * that is the whole point of it, since core asking "does the transcript
 * have anything" by name is the core-to-addon dependency
 * `.claude/rules/design-decisions.md` forbids.
 */
import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { act, renderHook } from "@testing-library/react";

import { useSlotAvailability } from "../useSlotAvailability";

describe("useSlotAvailability", () => {
  it("treats an entry that has said nothing as available", () => {
    // Silence is the state every addon written before this signal is
    // permanently in. If it meant "unavailable", adding the signal
    // would have taken a working tab away from all of them.
    const { result } = renderHook(() => useSlotAvailability("f1"));

    expect(result.current.isAvailable("anything-at-all")).toBe(true);
  });

  it("marks an entry unavailable once it says so", () => {
    const { result } = renderHook(() => useSlotAvailability("f1"));

    act(() => result.current.reporterFor("a")(false));

    expect(result.current.isAvailable("a")).toBe(false);
    // One entry's answer is its own.
    expect(result.current.isAvailable("b")).toBe(true);
  });

  it("lets an entry take it back", () => {
    // The case this exists for: an entry that is still fetching reports
    // nothing first and something a moment later. A one-way latch would
    // hide the panel for the rest of the file's life.
    const { result } = renderHook(() => useSlotAvailability("f1"));

    act(() => result.current.reporterFor("a")(false));
    act(() => result.current.reporterFor("a")(true));

    expect(result.current.isAvailable("a")).toBe(true);
  });

  it("forgets the answers when the file changes", () => {
    const { result, rerender } = renderHook(
      ({ fileId }) => useSlotAvailability(fileId),
      { initialProps: { fileId: "f1" } },
    );
    act(() => result.current.reporterFor("a")(false));
    expect(result.current.isAvailable("a")).toBe(false);

    rerender({ fileId: "f2" });

    // Availability is a fact about a file, and this is a different one.
    // Carrying it over hides a panel on a file nobody asked about.
    expect(result.current.isAvailable("a")).toBe(true);
  });

  it("clears them without committing a frame that still says otherwise", () => {
    // Effects run only for renders that were committed, so this counts
    // what reached the screen. Resetting in an effect would put the
    // previous file's "unavailable" on screen for one commit — long
    // enough to draw a strip missing a tab the new file does have, and
    // then to redraw it. Resetting during render makes React throw that
    // pass away before it is committed, so nothing ever sees it.
    const committed: boolean[] = [];
    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => {
        const availability = useSlotAvailability(fileId);
        const value = availability.isAvailable("a");
        useEffect(() => {
          committed.push(value);
        });
        return availability;
      },
      { initialProps: { fileId: "f1" } },
    );
    act(() => result.current.reporterFor("a")(false));
    committed.length = 0;

    rerender({ fileId: "f2" });

    expect(committed).toEqual([true]);
  });

  it("hands out the same reporter every time, so a panel is not re-rendered", () => {
    // It is passed to an addon component as a prop. A new function each
    // render is a changed prop on every parent render, and the entry
    // holding it in a dependency array would re-run its effects.
    const { result, rerender } = renderHook(
      ({ fileId }) => useSlotAvailability(fileId),
      { initialProps: { fileId: "f1" } },
    );
    const first = result.current.reporterFor("a");

    rerender({ fileId: "f1" });
    expect(result.current.reporterFor("a")).toBe(first);

    act(() => result.current.reporterFor("a")(false));
    expect(result.current.reporterFor("a")).toBe(first);
  });
});
