import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useHighlightPassage } from "../useHighlightPassage";

// jsdom does not implement scrollIntoView; stub it so the hook's
// successful path runs to completion without throwing.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function HarnessFixture({
  html,
  quote,
  ready = true,
}: {
  html: string;
  quote: string | undefined;
  ready?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useHighlightPassage(ref, quote, ready);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

describe("useHighlightPassage", () => {
  it("wraps a verbatim match in a <mark class='ask-citation-highlight'>", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>The quick brown fox jumps over the lazy dog.</p>"
        quote="brown fox jumps"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent).toBe("brown fox jumps");
  });

  it("matches case-insensitively", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>HomeVault is an intelligence-first product.</p>"
        quote="homevault is"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent?.toLowerCase()).toBe("homevault is");
  });

  it("collapses whitespace so newline-broken quotes still match", () => {
    const { container } = render(
      <HarnessFixture
        html={`<p>line one\n  line two\tline three</p>`}
        quote="line one line two line three"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark).not.toBeNull();
  });

  it("falls back to a leading prefix when the full quote is not found", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>alpha beta gamma delta epsilon zeta eta theta.</p>"
        quote="alpha beta gamma delta NOPE NEVER"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent).toMatch(/^alpha beta gamma/);
  });

  it("returns no <mark> when the quote does not appear at all", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>alpha beta gamma.</p>"
        quote="zeta eta theta iota"
      />,
    );
    expect(container.querySelector("mark.ask-citation-highlight")).toBeNull();
  });

  it("does nothing when ready=false", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>alpha beta gamma.</p>"
        quote="alpha beta gamma"
        ready={false}
      />,
    );
    expect(container.querySelector("mark.ask-citation-highlight")).toBeNull();
  });

  it("does nothing when quote is empty", () => {
    const { container } = render(
      <HarnessFixture html="<p>alpha beta.</p>" quote="" />,
    );
    expect(container.querySelector("mark.ask-citation-highlight")).toBeNull();
  });

  it("matches across smart-quote vs straight-quote divergence", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>It's a hot day in summer.</p>"
        quote={"It’s a hot day"}
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent?.toLowerCase()).toBe("it's a hot day");
  });

  it("matches a contiguous N-word window when head and tail both diverge", () => {
    // Head and tail both diverge, so prefix and suffix shrink would both miss.
    const { container } = render(
      <HarnessFixture
        html="<p>Some intro text. The indexer applies a multi-stage retrieval pipeline before ranking. Closing thoughts.</p>"
        quote="The system uses multi-stage retrieval pipeline before processing the final result"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent?.toLowerCase()).toMatch(
      /multi-stage retrieval pipeline before/,
    );
  });

  it("matches a contiguous CJK character run (no whitespace tokens)", () => {
    // No spaces in the text, so the word-token fallbacks never engage.
    const { container } = render(
      <HarnessFixture
        html="<p>HomeVault は元々ファイル管理アプリだが、Obsidian/Notion が要求する「書く文化」を持たない多数派にとって第二の脳の最後の砦になりうる。</p>"
        quote="本計画は、従来の知識ベース（ObsidianやNotion）が要求する「書く文化」を持たない多数派のユーザーをターゲットにしています。"
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    // Exact extent depends on the greedy expansion.
    expect(mark?.textContent).toMatch(/「書く文化」を持たない多数派/);
  });

  it("falls back to a character prefix when mid-quote diverges", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>The protagonist arrives in the silent city at dusk.</p>"
        quote="The protagonist arrives in (the bustling) city at dusk."
      />,
    );
    const mark = container.querySelector("mark.ask-citation-highlight");
    expect(mark?.textContent).toMatch(/^The protagonist arrives/);
  });
  it("marks every text node a quote crosses when it spans sibling elements", () => {
    // The shape syntax highlighting produces: one line, several token spans.
    const { container } = render(
      <HarnessFixture
        html={
          '<pre><span class="tok">const </span>' +
          '<span class="tok">answer</span> = 42;</pre>'
        }
        quote="const answer = 42"
      />,
    );
    const marks = Array.from(
      container.querySelectorAll("mark.ask-citation-highlight"),
    );
    expect(marks.length).toBeGreaterThan(1);
    expect(marks.map((m) => m.textContent).join("")).toBe("const answer = 42");
  });

  it("marks every text node a quote crosses when it spans block elements", () => {
    const { container } = render(
      <HarnessFixture
        html={"<p>the first half</p>\n<p>and the second half</p>"}
        quote="first half and the second"
      />,
    );
    const marks = Array.from(
      container.querySelectorAll("mark.ask-citation-highlight"),
    );
    expect(marks.length).toBeGreaterThan(1);
    expect(marks.map((m) => m.textContent).join("")).toBe(
      "first half\nand the second",
    );
  });

  it("leaves the text outside the quote unmarked at both ends", () => {
    const { container } = render(
      <HarnessFixture
        html='<pre>before <span class="tok">middle</span> after</pre>'
        quote="fore middle af"
      />,
    );
    const marks = Array.from(
      container.querySelectorAll("mark.ask-citation-highlight"),
    );
    expect(marks.map((m) => m.textContent).join("")).toBe("fore middle af");
    expect(container.textContent).toBe("before middle after");
  });

  it("wraps a single-node match in exactly one <mark>", () => {
    const { container } = render(
      <HarnessFixture
        html="<p>The quick brown fox jumps over the lazy dog.</p>"
        quote="brown fox jumps"
      />,
    );
    expect(
      container.querySelectorAll("mark.ask-citation-highlight"),
    ).toHaveLength(1);
  });

  it("does not re-mark an already-marked container on re-render", () => {
    const { container, rerender } = render(
      <HarnessFixture
        html='<pre><span class="tok">const </span><span class="tok">answer</span></pre>'
        quote="const answer"
      />,
    );
    const first = container.querySelectorAll("mark.ask-citation-highlight")
      .length;
    rerender(
      <HarnessFixture
        html='<pre><span class="tok">const </span><span class="tok">answer</span></pre>'
        quote="const answer"
      />,
    );
    expect(
      container.querySelectorAll("mark.ask-citation-highlight"),
    ).toHaveLength(first);
  });
});
