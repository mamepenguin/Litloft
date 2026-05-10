import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markdownContentRegistry } from "@/lib/markdownContentRegistry";

beforeEach(() => {
  markdownContentRegistry.reset();
});

afterEach(() => {
  markdownContentRegistry.reset();
});

describe("markdownContentRegistry", () => {
  // Phase 3.5 fix-up for spec 2026-05-10 §D2 / hako ZWLqXgdTwt9le4dAI3U8C:
  // a tiny module-level store that lets the inspector's EditableTagChips
  // share the editor's `content` state via content-mode, eliminating
  // the etag race between standalone tag saves and editor textarea
  // autosaves on `.md` in document-layout mode.

  it("returns null when nothing is registered for a fileId", () => {
    expect(markdownContentRegistry.lookup("missing")).toBeNull();
  });

  it("returns the registered entry after register()", () => {
    let stored = "initial";
    const entry = {
      getContent: () => stored,
      setContent: (next: string) => {
        stored = next;
      },
    };
    markdownContentRegistry.register("f1", entry);

    const found = markdownContentRegistry.lookup("f1");
    expect(found).not.toBeNull();
    expect(found!.getContent()).toBe("initial");

    found!.setContent("updated");
    expect(stored).toBe("updated");
    // Subsequent reads reflect the same backing state.
    expect(found!.getContent()).toBe("updated");
  });

  it("unregisters via the returned dispose function", () => {
    const dispose = markdownContentRegistry.register("f1", {
      getContent: () => "x",
      setContent: () => undefined,
    });
    expect(markdownContentRegistry.lookup("f1")).not.toBeNull();
    dispose();
    expect(markdownContentRegistry.lookup("f1")).toBeNull();
  });

  it("supports multiple fileIds without crosstalk", () => {
    markdownContentRegistry.register("a", {
      getContent: () => "a-content",
      setContent: () => undefined,
    });
    markdownContentRegistry.register("b", {
      getContent: () => "b-content",
      setContent: () => undefined,
    });
    expect(markdownContentRegistry.lookup("a")!.getContent()).toBe("a-content");
    expect(markdownContentRegistry.lookup("b")!.getContent()).toBe("b-content");
  });

  it("replaces an existing registration when register() is called again for the same fileId", () => {
    // The Editor remounts when fileId changes (its useEffect dep
    // includes fileId). Re-registering the same fileId must replace
    // the previous entry — otherwise stale closures point at unmounted
    // state. Mirrors the dirtyRegistry "set replaces" behaviour.
    markdownContentRegistry.register("f1", {
      getContent: () => "old",
      setContent: () => undefined,
    });

    let stored = "fresh";
    markdownContentRegistry.register("f1", {
      getContent: () => stored,
      setContent: (next) => {
        stored = next;
      },
    });

    const found = markdownContentRegistry.lookup("f1");
    expect(found!.getContent()).toBe("fresh");
    found!.setContent("after");
    expect(stored).toBe("after");
  });

  it("notifies subscribers on register / unregister", () => {
    const listener = vi.fn();
    const unsubscribe = markdownContentRegistry.subscribe(listener);

    const dispose = markdownContentRegistry.register("f1", {
      getContent: () => "",
      setContent: () => undefined,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    dispose();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("does not notify after the subscriber unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = markdownContentRegistry.subscribe(listener);
    unsubscribe();
    markdownContentRegistry.register("f1", {
      getContent: () => "",
      setContent: () => undefined,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset() drops every registration AND every subscriber", () => {
    const listener = vi.fn();
    markdownContentRegistry.subscribe(listener);
    markdownContentRegistry.register("f1", {
      getContent: () => "",
      setContent: () => undefined,
    });
    listener.mockClear();

    markdownContentRegistry.reset();

    // After reset, the prior entry is gone.
    expect(markdownContentRegistry.lookup("f1")).toBeNull();
    // And the prior subscriber must not fire on later activity.
    markdownContentRegistry.register("f2", {
      getContent: () => "",
      setContent: () => undefined,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
