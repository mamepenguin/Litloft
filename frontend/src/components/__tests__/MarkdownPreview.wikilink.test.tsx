import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

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
    expect(link!.getAttribute("data-wiki-target")).toBe("X");
  });

  it("preserves heading anchor text for [[X#heading]] but still routes to /files/{id}", () => {
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
    expect(span!.getAttribute("title")).toMatch(/2/);
    expect(span!.textContent).toBe("Common");
  });

  it("falls back to unresolved when wikiResolution prop is omitted entirely", () => {
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
    expect(links[0].tagName.toLowerCase()).toBe("span");
    expect(links[0].classList.contains("wiki-unresolved")).toBe(true);
    expect(links[0].getAttribute("data-wiki-target")).toBe("Missing");
    expect(links[1].tagName.toLowerCase()).toBe("a");
    expect(links[1].getAttribute("data-wiki-target")).toBe("Present");
  });

  it("escapes HTML inside the wiki-link target to prevent XSS", () => {
    const { container } = render(
      <MarkdownPreview
        source={"Look: [[<script>alert(1)</script>]]"}
        wikiResolution={{
          "<script>alert(1)</script>": { kind: "unresolved" },
        }}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.textContent).toContain("<script>");
    expect(span!.innerHTML).not.toContain("<script>");
  });

  it("does not render [[]] (empty target) as a wiki link", () => {
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
    const loftLink = container.querySelector<HTMLAnchorElement>(
      'a[href^="/files/abc123def456"]',
    );
    expect(loftLink).not.toBeNull();
    expect(loftLink!.getAttribute("href")).toBe("/files/abc123def456?t=12");
    const wikiLink = container.querySelector<HTMLAnchorElement>("a.wiki-link");
    expect(wikiLink).not.toBeNull();
    expect(wikiLink!.classList.contains("wiki-resolved")).toBe(true);
    expect(wikiLink!.getAttribute("href")).toBe("/files/noteid000001");
  });

  it("does not let linkify auto-link content inside [[ ]]", () => {
    const { container } = render(
      <MarkdownPreview
        source={"Bracketed: [[example.com]]"}
        wikiResolution={{ "example.com": { kind: "unresolved" } }}
      />,
    );
    const external = container.querySelector(
      'a[href^="http://example.com"], a[href^="https://example.com"]',
    );
    expect(external).toBeNull();
    const span = container.querySelector<HTMLSpanElement>("span.wiki-link");
    expect(span).not.toBeNull();
    expect(span!.getAttribute("data-wiki-target")).toBe("example.com");
  });

  it("does not turn mermaid fences into wiki-links", () => {
    const src = "```mermaid\nflowchart LR\nA[[Note]]-->B\n```";
    const { container } = render(<MarkdownPreview source={src} />);
    expect(container.querySelector(".wiki-link")).toBeNull();
    expect(container.querySelector("pre.mermaid-source")).not.toBeNull();
  });

  it("ignores wiki-link syntax in frontmatter values", () => {
    const src = `---\ntitle: "[[A wiki link inside frontmatter]]"\n---\n\nBody\n`;
    const { container } = render(<MarkdownPreview source={src} />);
    expect(container.querySelector("span.wiki-link, a.wiki-link")).toBeNull();
  });
});
