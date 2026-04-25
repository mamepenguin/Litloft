import { afterEach, describe, expect, it } from "vitest";
import { normalizeKey } from "../shortcuts";

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
