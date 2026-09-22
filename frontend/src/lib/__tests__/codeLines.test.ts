import { describe, it, expect } from "vitest";
import hljs from "highlight.js";

import { splitHighlightedLines, splitPlainLines } from "../codeLines";

/** What a reader would see: the lines put back together. */
function rendered(lines: string[]): string {
  const host = document.createElement("div");
  host.innerHTML = lines.map((line) => `<span>${line}\n</span>`).join("");
  return host.textContent ?? "";
}

describe("splitPlainLines", () => {
  it("returns one entry per line, without the break", () => {
    expect(splitPlainLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("drops only the empty entry a trailing newline leaves", () => {
    expect(splitPlainLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitPlainLines("a\nb")).toEqual(["a", "b"]);
    expect(splitPlainLines("a\n\n")).toEqual(["a", ""]);
  });

  it("has no line at all for an empty file", () => {
    expect(splitPlainLines("")).toEqual([]);
  });

  it("reads CRLF as one break", () => {
    expect(splitPlainLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("splitHighlightedLines", () => {
  it("puts each line in its own entry", () => {
    const html = hljs.highlight("const a = 1;\nconst b = 2;\n", {
      language: "javascript",
      ignoreIllegals: true,
    }).value;
    expect(splitHighlightedLines(html)).toHaveLength(2);
  });

  it("reopens a span that straddles a break", () => {
    // A block comment is one hljs span covering three lines.
    const html = hljs.highlight("/* one\n two\n three */\nafter", {
      language: "javascript",
      ignoreIllegals: true,
    }).value;
    const lines = splitHighlightedLines(html);
    expect(lines).toHaveLength(4);
    for (const line of lines.slice(0, 3)) {
      expect(line).toContain("hljs-comment");
    }
    expect(lines[3]).not.toContain("hljs-comment");
  });

  it("keeps every character of the source, in order", () => {
    const source = [
      "/* a comment",
      "   that spans lines */",
      'const s = "a < b && c > d";',
      "",
      "function f() { return 1; }",
    ].join("\n");
    const html = hljs.highlight(source, {
      language: "javascript",
      ignoreIllegals: true,
    }).value;
    expect(rendered(splitHighlightedLines(html))).toBe(`${source}\n`);
  });

  it("keeps a template literal's own newlines as lines", () => {
    const source = "const t = `one\ntwo`;\n";
    const html = hljs.highlight(source, {
      language: "javascript",
      ignoreIllegals: true,
    }).value;
    const lines = splitHighlightedLines(html);
    expect(lines).toHaveLength(2);
    expect(rendered(lines)).toBe(source);
  });

  it("numbers a file with no trailing newline to its last line", () => {
    const html = hljs.highlight("a = 1\nb = 2", {
      language: "python",
      ignoreIllegals: true,
    }).value;
    expect(splitHighlightedLines(html)).toHaveLength(2);
  });

  it("leaves no phantom line after a trailing newline", () => {
    const html = hljs.highlight("a = 1\nb = 2\n", {
      language: "python",
      ignoreIllegals: true,
    }).value;
    expect(splitHighlightedLines(html)).toHaveLength(2);
  });

  it("has no line at all for an empty file", () => {
    expect(splitHighlightedLines("")).toEqual([]);
  });

  it("keeps markup characters escaped", () => {
    const html = hljs.highlight('const s = "<script>";\n', {
      language: "javascript",
      ignoreIllegals: true,
    }).value;
    const lines = splitHighlightedLines(html);
    expect(lines[0]).toContain("&lt;script&gt;");
    expect(lines[0]).not.toContain("<script>");
    expect(rendered(lines)).toBe('const s = "<script>";\n');
  });

  it("returns to the enclosing span after a nested one closes", () => {
    // The text is the same either way, so this reads the structure: with the
    // walk resuming at the wrong depth, `three` lands outside `outer`.
    const lines = splitHighlightedLines(
      '<span class="outer">one<span class="inner">two</span>three\nfour</span>',
    );
    expect(lines).toHaveLength(2);

    const host = document.createElement("div");
    host.innerHTML = lines[0];
    expect(host.querySelector(".outer")?.textContent).toBe("onetwothree");
    expect(host.querySelector(".inner")?.textContent).toBe("two");

    host.innerHTML = lines[1];
    expect(host.querySelector(".outer")?.textContent).toBe("four");
    expect(rendered(lines)).toBe("onetwothree\nfour\n");
  });

  it("reopens nested spans to the same depth", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<span class="outer"><span class="inner">one\ntwo</span></span>';
    const lines = splitHighlightedLines(host.innerHTML);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain('class="outer"');
      expect(line).toContain('class="inner"');
    }
    expect(rendered(lines)).toBe("one\ntwo\n");
  });
});
