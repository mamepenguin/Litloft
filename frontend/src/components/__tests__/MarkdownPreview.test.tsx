import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { NextIntlClientProvider } from "next-intl";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ text: { loading: "Loading...", loadFailed: "Failed {error}" } }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MarkdownPreview", () => {
  it("renders basic markdown to HTML", () => {
    renderWithIntl(<MarkdownPreview source={"# Hello\n\nWorld"} />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("renders links with safe attributes", () => {
    renderWithIntl(<MarkdownPreview source={"[click](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "click" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("strips javascript: URLs from links", () => {
    // markdown-it rejects dangerous schemes outright — no <a> is emitted,
    // only the link text survives.
    renderWithIntl(<MarkdownPreview source={"[bad](javascript:x)"} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/bad/)).toBeInTheDocument();
  });

  it("does not render raw HTML <script> tags", () => {
    renderWithIntl(
      <MarkdownPreview source="<script>alert('xss')</script>Safe content" />,
    );
    expect(document.querySelector("script")).toBeNull();
  });

  it("does not render raw HTML <iframe> tags", () => {
    renderWithIntl(
      <MarkdownPreview source='<iframe src="https://evil.com"></iframe>Hi' />,
    );
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("strips onerror handler from img tags", () => {
    renderWithIntl(
      <MarkdownPreview source='![alt](https://example.com/x.jpg "title")' />,
    );
    // markdown-it renders image as <img> — our sanitizer should pass safe img
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("renders code blocks", () => {
    renderWithIntl(
      <MarkdownPreview source={"```\nconst x = 1;\n```"} />,
    );
    expect(document.querySelector("code")).not.toBeNull();
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
  });

  it("displays frontmatter metadata when present via the Properties Panel", () => {
    // Unknown keys fall through to plain text rendering (label = raw key).
    // Recognised keys get typed renderers; see PropertiesPanel.test.tsx.
    const md = `---
source_url: https://example.com
author: Tarou
---

# Body`;
    renderWithIntl(<MarkdownPreview source={md} />);
    expect(screen.getByText("source_url")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("Tarou")).toBeInTheDocument();
  });

  it("hides frontmatter section when empty", () => {
    renderWithIntl(<MarkdownPreview source="just content\n" />);
    // No <dl> rendered for empty frontmatter
    expect(document.querySelector("dl")).toBeNull();
  });

  it("respects showFrontmatter=false", () => {
    const md = `---
foo: bar
---

text`;
    renderWithIntl(<MarkdownPreview source={md} showFrontmatter={false} />);
    expect(document.querySelector("dl")).toBeNull();
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("renders lists", () => {
    renderWithIntl(<MarkdownPreview source={"- one\n- two\n- three"} />);
    expect(document.querySelectorAll("li").length).toBe(3);
  });

  it("applies text-base typography to the chrome body for 16px reading", () => {
    // Phase 1 typography upgrade: the chrome body now renders at
    // ``text-base`` (16px) with leading-relaxed (1.625) so long-form
    // summary prose matches the mockup design (DESIGN.md §3.2). The
    // old ``text-sm`` rendered at 14px and felt cramped.
    const { container } = renderWithIntl(
      <MarkdownPreview source={"# Hello\n\nWorld"} />,
    );
    const body = container.querySelector(".markdown-body");
    expect(body).not.toBeNull();
    expect(body!.className).toContain("text-base");
    expect(body!.className).toContain("leading-relaxed");
    expect(body!.className).not.toMatch(/\btext-sm\b/);
  });
});
