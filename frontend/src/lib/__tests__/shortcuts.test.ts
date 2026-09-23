import { afterEach, describe, expect, it } from "vitest";
import {
  OVERLAY_PRIORITY,
  formatShortcut,
  formatShortcutPart,
  normalizeKey,
  orderContexts,
  type ShortcutContextDef,
} from "../shortcuts";

const realPlatform = Object.getOwnPropertyDescriptor(
  window.navigator,
  "platform",
);

function setPlatform(value: string): void {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value,
  });
}

function makeEvent(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

afterEach(() => {
  if (realPlatform) {
    Object.defineProperty(window.navigator, "platform", realPlatform);
  }
});

describe("normalizeKey — platform-aware modifiers", () => {
  it("Win/Linux: ctrlKey is the primary modifier", () => {
    setPlatform("Win32");
    expect(
      normalizeKey(makeEvent({ key: "k", ctrlKey: true })),
    ).toBe("ctrl+k");
  });

  it("Win/Linux: metaKey alone (Win/Super key) does NOT qualify", () => {
    setPlatform("Win32");
    expect(normalizeKey(makeEvent({ key: "k", metaKey: true }))).toBe("k");
  });

  it("macOS: metaKey is the primary modifier", () => {
    setPlatform("MacIntel");
    expect(
      normalizeKey(makeEvent({ key: "k", metaKey: true })),
    ).toBe("ctrl+k");
  });

  it("macOS: ctrlKey alone does NOT match a 'ctrl+' shortcut", () => {
    setPlatform("MacIntel");
    expect(normalizeKey(makeEvent({ key: "k", ctrlKey: true }))).toBe("k");
  });

  it("macOS: Cmd+Shift+\\ normalizes to ctrl+shift+\\", () => {
    setPlatform("MacIntel");
    expect(
      normalizeKey(
        makeEvent({ key: "\\", metaKey: true, shiftKey: true }),
      ),
    ).toBe("ctrl+shift+\\");
  });

  it("plain Shift+printable does not get a shift+ prefix", () => {
    setPlatform("Win32");
    // Browser delivers e.key = "?" for Shift+/
    expect(normalizeKey(makeEvent({ key: "?", shiftKey: true }))).toBe("?");
  });

  it("Shift + named key keeps shift+ prefix", () => {
    setPlatform("Win32");
    expect(
      normalizeKey(makeEvent({ key: "ArrowLeft", shiftKey: true })),
    ).toBe("shift+arrowleft");
  });

  it("Space normalizes to 'space'", () => {
    setPlatform("Win32");
    expect(normalizeKey(makeEvent({ key: " " }))).toBe("space");
  });

  it("Alt is platform-independent", () => {
    setPlatform("MacIntel");
    expect(normalizeKey(makeEvent({ key: "j", altKey: true }))).toBe("alt+j");
    setPlatform("Win32");
    expect(normalizeKey(makeEvent({ key: "j", altKey: true }))).toBe("alt+j");
  });
});

describe("formatShortcut — how a chord is written for the reader", () => {
  it("writes the primary modifier as the Command glyph on macOS", () => {
    setPlatform("MacIntel");
    expect(formatShortcut("ctrl+k")).toBe("⌘K");
    expect(formatShortcutPart("shift")).toBe("⇧");
  });

  it("spells it out elsewhere", () => {
    setPlatform("Win32");
    expect(formatShortcut("ctrl+k")).toBe("Ctrl+K");
    expect(formatShortcut("ctrl+shift+f")).toBe("Ctrl+Shift+F");
  });

  it("names the keys that have no printable face", () => {
    setPlatform("Linux x86_64");
    expect(["escape", "space", "arrowup"].map(formatShortcutPart)).toEqual(["Esc", "Space", "↑"]);
  });
});

describe("orderContexts — a context that takes the keyboard", () => {
  const ctx = (
    id: string,
    priority = 0,
    blocksLower = false,
  ): ShortcutContextDef => ({ id, label: id, shortcuts: [], priority, blocksLower });

  it("hides every context of a lower priority, wherever it was pushed", () => {
    const ordered = orderContexts([
      ctx("global-search"),
      ctx("viewer", OVERLAY_PRIORITY, true),
      ctx("file-nav"),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(["viewer"]);
  });

  it("keeps what shares its priority, or sits above it", () => {
    const ordered = orderContexts([
      ctx("viewer", OVERLAY_PRIORITY, true),
      ctx("viewer-zoom", OVERLAY_PRIORITY),
      ctx("search-panel", OVERLAY_PRIORITY),
      ctx("nested", OVERLAY_PRIORITY + 100),
      ctx("global"),
    ]);
    expect(ordered.map((c) => c.id)).toEqual([
      "nested",
      "search-panel",
      "viewer-zoom",
      "viewer",
    ]);
  });

  it("leaves the order alone when nothing takes the keyboard", () => {
    const ordered = orderContexts([ctx("a"), ctx("b", OVERLAY_PRIORITY), ctx("c")]);
    expect(ordered.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

