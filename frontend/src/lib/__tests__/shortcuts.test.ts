import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

  it.each([
    ["MacIntel", { metaKey: true }],
    ["Win32", { ctrlKey: true }],
  ])(
    "%s: primary+Shift+\\ arrives as | and normalizes to ctrl+shift+\\",
    (platform, modifier) => {
      setPlatform(platform);
      expect(
        normalizeKey(makeEvent({ key: "|", shiftKey: true, ...modifier })),
      ).toBe("ctrl+shift+\\");
    },
  );

  it("a shifted punctuation key with only Shift keeps its shifted face", () => {
    setPlatform("Win32");
    expect(normalizeKey(makeEvent({ key: "|", shiftKey: true }))).toBe("|");
  });

  it("Ctrl+Shift+F still normalizes to ctrl+shift+f", () => {
    setPlatform("Win32");
    expect(
      normalizeKey(makeEvent({ key: "F", ctrlKey: true, shiftKey: true })),
    ).toBe("ctrl+shift+f");
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


const US_SHIFTED: Record<string, string> = {
  "`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^",
  "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+", "[": "{",
  "]": "}", "\\": "|", ";": ":", "'": '"', ",": "<", ".": ">", "/": "?",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "__tests__") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function shiftPunctuationBindings(): string[] {
  const frontend = resolve(__dirname, "../../..");
  const roots = [
    join(frontend, "src"),
    ...readdirSync(resolve(frontend, "../addons"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(frontend, "../addons", entry.name, "frontend")),
  ].filter((root) => {
    try {
      return readdirSync(root).length > 0;
    } catch {
      return false;
    }
  });
  const found = new Set<string>();
  for (const file of roots.flatMap(sourceFiles)) {
    for (const match of readFileSync(file, "utf8").matchAll(
      /\bkey:\s*("(?:[^"\\\n]|\\.)*")/g,
    )) {
      const chord = JSON.parse(match[1]) as string;
      if (chord.includes("shift+") && /^.+\+[^a-zA-Z]$/.test(chord)) {
        found.add(chord);
      }
    }
  }
  return [...found];
}

// UNSPEC: a Cmd/Ctrl+Shift chord on a punctuation key fires on a real
// keypress (docs/user-guide/keyboard-shortcuts.md, Cmd/Ctrl+Shift+\).
describe("normalizeKey — every Shift chord on a punctuation key", () => {
  it("matches the event a US keyboard delivers for each registered binding", () => {
    setPlatform("Win32");
    const chords = shiftPunctuationBindings();
    expect(chords.length).toBeGreaterThan(0);
    for (const chord of chords) {
      const parts = chord.split("+");
      const face = parts[parts.length - 1];
      const key = US_SHIFTED[face] ?? face;
      const event = makeEvent({
        key,
        shiftKey: true,
        ctrlKey: parts.includes("ctrl"),
        altKey: parts.includes("alt"),
      });
      expect(normalizeKey(event), chord).toBe(chord);
    }
  });
});
