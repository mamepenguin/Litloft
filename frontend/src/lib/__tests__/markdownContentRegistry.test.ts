import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markdownContentRegistry } from "@/lib/markdownContentRegistry";

beforeEach(() => {
  markdownContentRegistry.reset();
});

afterEach(() => {
  markdownContentRegistry.reset();
});

describe("markdownContentRegistry", () => {
  // Lets the inspector's EditableTagChips share the editor's `content`
  // state, so standalone tag saves and editor autosaves on `.md` do not
  // race on the etag.

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
    // state.
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

  describe("save-success channel (Phase 3 follow-up hako 0RnZ1KdtomAfIJPLAGIHA)", () => {
    it("calls every subscriber for a fileId when notifySaved fires", () => {
      const a = vi.fn();
      const b = vi.fn();
      markdownContentRegistry.subscribeSaved("f1", a);
      markdownContentRegistry.subscribeSaved("f1", b);
      markdownContentRegistry.notifySaved("f1");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it("does not call subscribers of a different fileId", () => {
      const a = vi.fn();
      const b = vi.fn();
      markdownContentRegistry.subscribeSaved("f1", a);
      markdownContentRegistry.subscribeSaved("f2", b);
      markdownContentRegistry.notifySaved("f1");
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).not.toHaveBeenCalled();
    });

    it("notifySaved on an unsubscribed fileId is a no-op", () => {
      expect(() =>
        markdownContentRegistry.notifySaved("never-subscribed"),
      ).not.toThrow();
    });

    it("dispose function removes the subscriber and cleans up the slot", () => {
      const fn = vi.fn();
      const dispose = markdownContentRegistry.subscribeSaved("f1", fn);
      dispose();
      markdownContentRegistry.notifySaved("f1");
      expect(fn).not.toHaveBeenCalled();
    });

    it("reset() drops save subscribers too", () => {
      const fn = vi.fn();
      markdownContentRegistry.subscribeSaved("f1", fn);
      markdownContentRegistry.reset();
      markdownContentRegistry.notifySaved("f1");
      expect(fn).not.toHaveBeenCalled();
    });
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

    expect(markdownContentRegistry.lookup("f1")).toBeNull();
    markdownContentRegistry.register("f2", {
      getContent: () => "",
      setContent: () => undefined,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
