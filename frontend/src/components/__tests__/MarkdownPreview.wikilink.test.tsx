import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * Phase C, spec 2026-05-12-markdown-link-three-forms.md §3.8.
 *
 * The renderer extends ``markdown-it`` with an inline rule that detects
 * ``[[X]]``, ``[[X|display]]`` and ``[[X#heading]]`` and emits one of
 * three DOM shapes based on a caller-provided resolution map:
 *
 *  - ``{kind: "resolved", file_id}``        -> <a href="/files/{id}">
 *  - ``{kind: "unresolved"}``               -> <span class="wiki-unresolved">
 *  - ``{kind: "ambiguous", candidates: []}``-> <span class="wiki-ambiguous" title=...>
 *
 * When no ``wikiResolution`` prop is supplied (or the target is absent
 * from the map) the renderer falls back to ``unresolved`` -- pessimistic
 * default, because the server hasn't told us anything yet.
 *
 * These tests run RED until the inline rule lands.
 */
describe("MarkdownPreview wiki-link rendering", () => {
  it("renders [[X]] as a resolved <a> when wikiResolution maps X to a file_id", () => {
    const { container } = render(
      <MarkdownPreview
        source={"See [[X]] for context."}
        wikiResolution={{
          X: { kind: "resolved", file_id: "abc123def456" },
        }}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>("a.wiki-link");
    expect(link).not.toBeNull();
    expect(link!.classList.contains("wiki-resolved")).toBe(true);
    expect(link!.getAttribute("href")).toBe("/files/abc123def456");
    expect(link!.getAttribute("data-wiki-target")).toBe("X");
    expect(link!.textContent).toBe("X");
  });

  it("uses the display text from [[X|display]] while routing to X's file_id", () => {
    const { container } = render(
      <MarkdownPreview
        source={"See [[X|the X note]] above."}
        wikiResolution={{
          X: { kind: "resolved", file_id: "abc123def456" },
        }}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>("a.wiki-link");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/files/abc123def456");
    expect(link!.textContent).toBe("the X note");
    // The data attribute carries the raw target so consumers (e.g. the
    // unresolved click handler) can identify the link irrespective of
    // its display form.
    expect(link!.getAttribute("data-wiki-target")).toBe("X");
  });

  it("preserves heading anchor text for [[X#heading]] but still routes to /files/{id}", () => {
    // Phase C scope: the heading anchor is preserved in the rendered
    // display text. Actual scroll-to-heading behaviour is deferred
    // (spec §6 out-of-scope).
    const { container } = render(
      <MarkdownPreview
        source={"Jump to [[X#part-2]]."}
        wikiResolution={{
          X: { kind: "resolved", file_id: "abc123def456" },
        }}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>("a.wiki-link");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/files/abc123def456");
    expect(link!.textContent).toBe("X#part-2");
  });

  it("renders [[X]] as a non-clickable <span class='wiki-unresolved'> when resolution says unresolved", () => {
    const { container } = render(
      <MarkdownPreview
        source={"See [[NewNote]] please."}
        wikiResolution={{
          NewNote: { kind: "unresolved" },
        }}
      />,
    );
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.classList.contains("wiki-unresolved")).toBe(true);
    expect(span!.tagName.toLowerCase()).toBe("span");
    expect(span!.getAttribute("data-wiki-target")).toBe("NewNote");
    expect(span!.textContent).toBe("NewNote");
    // No <a> with this target.
    expect(container.querySelector("a.wiki-link")).toBeNull();
  });

  it("renders [[X]] as ambiguous when resolution flags multiple candidates", () => {
    const { container } = render(
      <MarkdownPreview
        source={"Pick one: [[Common]]."}
        wikiResolution={{
          Common: {
            kind: "ambiguous",
            candidates: ["folder-a/Common.md", "folder-b/Common.md"],
          },
        }}
      />,
    );
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.classList.contains("wiki-ambiguous")).toBe(true);
    expect(span!.getAttribute("data-wiki-target")).toBe("Common");
    // The title attribute surfaces the candidate count so the user can
    // hover for context. The exact format is a localised "ambiguous link:
    // {N} matches" string -- this test only enforces that the count
    // appears, so a future tweak to the wording stays compatible.
    expect(span!.getAttribute("title")).toMatch(/2/);
    expect(span!.textContent).toBe("Common");
  });

  it("falls back to unresolved when wikiResolution prop is omitted entirely", () => {
    // Pessimistic default: we haven't asked the server yet, so the link
    // gets the grey/affordance-free unresolved styling. This avoids a
    // brief flash of "resolved -> unresolved" while the resolutions
    // request is in flight.
    const { container } = render(
      <MarkdownPreview source={"See [[Untouched]]."} />,
    );
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.classList.contains("wiki-unresolved")).toBe(true);
    expect(container.querySelector("a.wiki-link")).toBeNull();
  });

  it("falls back to unresolved when the target is not in the wikiResolution map", () => {
    const { container } = render(
      <MarkdownPreview
        source={"See [[Missing]] and [[Present]]."}
        wikiResolution={{
          Present: { kind: "resolved", file_id: "abc123def456" },
        }}
      />,
    );
    const links = container.querySelectorAll("a.wiki-link, span.wiki-link");
    expect(links.length).toBe(2);
    // The order in the source is Missing, then Present.
    expect(links[0].tagName.toLowerCase()).toBe("span");
    expect(links[0].classList.contains("wiki-unresolved")).toBe(true);
    expect(links[0].getAttribute("data-wiki-target")).toBe("Missing");
    expect(links[1].tagName.toLowerCase()).toBe("a");
    expect(links[1].getAttribute("data-wiki-target")).toBe("Present");
  });

  it("escapes HTML inside the wiki-link target to prevent XSS", () => {
    // The display text is whatever the user wrote between [[ and ]].
    // Even a well-formed target should never be inserted as raw HTML.
    const { container } = render(
      <MarkdownPreview
        source={"Look: [[<script>alert(1)</script>]]"}
        wikiResolution={{
          "<script>alert(1)</script>": { kind: "unresolved" },
        }}
      />,
    );
    // No actual <script> made it into the DOM.
    expect(container.querySelector("script")).toBeNull();
    // The unresolved span exists and carries the raw target text -- but
    // as text content, not as HTML.
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.textContent).toContain("<script>");
    // innerHTML must show the escaped form.
    expect(span!.innerHTML).not.toContain("<script>");
  });

  it("does not render [[]] (empty target) as a wiki link", () => {
    // Matches the backend extractor behaviour: empty targets are not
    // valid wiki-links, so the literal characters survive unchanged.
    const { container } = render(
      <MarkdownPreview source={"This [[]] should stay plain."} />,
    );
    expect(container.querySelector(".wiki-link")).toBeNull();
    expect(container.textContent).toContain("[[]]");
  });

  it("treats backslash-escaped \\[\\[X\\]\\] as literal text", () => {
    const { container } = render(
      <MarkdownPreview source={"Literal: \\[\\[X\\]\\]."} />,
    );
    expect(container.querySelector(".wiki-link")).toBeNull();
    expect(container.textContent).toContain("[[X]]");
  });

  it("renders both loft:// and wiki-link forms in the same body", () => {
    const { container } = render(
      <MarkdownPreview
        source={"Video: [clip](loft://abc123def456?t=12). Note: [[Note]]."}
        wikiResolution={{
          Note: { kind: "resolved", file_id: "noteid000001" },
        }}
      />,
    );
    // The loft:// link is unchanged in behaviour -- it routes to /files/{id}
    // with the t= query string preserved.
    const loftLink = container.querySelector<HTMLAnchorElement>(
      'a[href^="/files/abc123def456"]',
    );
    expect(loftLink).not.toBeNull();
    expect(loftLink!.getAttribute("href")).toBe("/files/abc123def456?t=12");
    // The wiki-link sits beside it with the wiki-resolved class.
    const wikiLink = container.querySelector<HTMLAnchorElement>("a.wiki-link");
    expect(wikiLink).not.toBeNull();
    expect(wikiLink!.classList.contains("wiki-resolved")).toBe(true);
    expect(wikiLink!.getAttribute("href")).toBe("/files/noteid000001");
  });

  it("does not let linkify auto-link content inside [[ ]]", () => {
    // Without an explicit guard, markdown-it's linkify pass would turn
    // [[example.com]] into <a href="http://example.com">[[example.com]]</a>.
    // The wiki rule must consume the brackets first.
    const { container } = render(
      <MarkdownPreview
        source={"Bracketed: [[example.com]]"}
        wikiResolution={{ "example.com": { kind: "unresolved" } }}
      />,
    );
    // The only link-shaped element for this target is the wiki span,
    // never an external anchor.
    const external = container.querySelector(
      'a[href^="http://example.com"], a[href^="https://example.com"]',
    );
    expect(external).toBeNull();
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.getAttribute("data-wiki-target")).toBe("example.com");
  });

  it("does not turn mermaid fences into wiki-links", () => {
    // Regression guard: the inline rule must not touch fenced code
    // blocks. Mermaid blocks are processed by the fence renderer.
    const src = "```mermaid\nflowchart LR\nA[[Note]]-->B\n```";
    const { container } = render(<MarkdownPreview source={src} />);
    // The body is rendered as a mermaid placeholder, so no wiki span.
    expect(container.querySelector(".wiki-link")).toBeNull();
    expect(container.querySelector("pre.mermaid-source")).not.toBeNull();
  });

  it("ignores wiki-link syntax in frontmatter values", () => {
    // Frontmatter rendering happens via the Properties Panel, not via
    // markdown-it. The inline rule should never see this content.
    const src = `---\ntitle: "[[A wiki link inside frontmatter]]"\n---\n\nBody\n`;
    const { container } = render(<MarkdownPreview source={src} />);
    expect(container.querySelector("span.wiki-link, a.wiki-link")).toBeNull();
  });
});
