import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * spec 2026-07-05-markdown-image-auto-grouping.md
 *
 * Consecutive images within the same inline run (no blank line between
 * them, i.e. same paragraph / list item / table cell) are wrapped in a
 * single <span class="markdown-image-group"> so CSS can lay them out as
 * an equal-height flex row. Markdown syntax itself is untouched — this
 * is a renderer-only transform on the parsed token tree.
 */
describe("MarkdownPreview image auto-grouping", () => {
  it("wraps two consecutive images (no blank line) in one markdown-image-group span", () => {
    const { container } = render(
      <MarkdownPreview source={"![a](https://example.com/a.jpg)\n![b](https://example.com/b.jpg)"} />,
    );
    const groups = container.querySelectorAll("span.markdown-image-group");
    expect(groups.length).toBe(1);
    const imgs = groups[0].querySelectorAll("img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toBe("https://example.com/a.jpg");
    expect(imgs[1].getAttribute("src")).toBe("https://example.com/b.jpg");
  });

  it("wraps three or more consecutive images in the same group", () => {
    const { container } = render(
      <MarkdownPreview
        source={
          "![a](https://example.com/a.jpg)\n" +
          "![b](https://example.com/b.jpg)\n" +
          "![c](https://example.com/c.jpg)"
        }
      />,
    );
    const groups = container.querySelectorAll("span.markdown-image-group");
    expect(groups.length).toBe(1);
    expect(groups[0].querySelectorAll("img").length).toBe(3);
  });

  it("does not wrap a single-image paragraph", () => {
    const { container } = render(
      <MarkdownPreview source={"![a](https://example.com/a.jpg)"} />,
    );
    expect(container.querySelectorAll("span.markdown-image-group").length).toBe(0);
    expect(container.querySelectorAll("img").length).toBe(1);
  });

  it("does not group images separated by ordinary text", () => {
    const { container } = render(
      <MarkdownPreview
        source={"![a](https://example.com/a.jpg) の説明文 ![b](https://example.com/b.jpg)"}
      />,
    );
    expect(container.querySelectorAll("span.markdown-image-group").length).toBe(0);
    expect(container.querySelectorAll("img").length).toBe(2);
    expect(container.textContent).toContain("の説明文");
  });

  it("does not group images in separate paragraphs (blank line between)", () => {
    const { container } = render(
      <MarkdownPreview
        source={"![a](https://example.com/a.jpg)\n\n![b](https://example.com/b.jpg)"}
      />,
    );
    expect(container.querySelectorAll("span.markdown-image-group").length).toBe(0);
    expect(container.querySelectorAll("p").length).toBe(2);
  });

  it("groups loft:// and external-URL images together in the same run", () => {
    const { container } = render(
      <MarkdownPreview
        source={"![a](loft://abc123def456)\n![b](https://example.com/b.jpg)"}
      />,
    );
    const groups = container.querySelectorAll("span.markdown-image-group");
    expect(groups.length).toBe(1);
    const imgs = groups[0].querySelectorAll("img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toBe("/api/files/abc123def456/stream");
    expect(imgs[1].getAttribute("src")).toBe("https://example.com/b.jpg");
    // loft image's click-through link must survive being wrapped in the group
    const loftLink = groups[0].querySelector("a.loft-image-link");
    expect(loftLink).not.toBeNull();
    expect(loftLink?.getAttribute("href")).toBe("/files/abc123def456");
  });
});
