import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MarkdownFileViewer, MarkdownPreview } from "@/components/MarkdownPreview";
import { NextIntlClientProvider } from "next-intl";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ text: { loading: "Loading...", loadFailed: "Failed {error}" } }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MarkdownPreview", () => {
  it("publishes selected text with the nearest Markdown heading", () => {
    const onDocumentCaptureController = vi.fn();
    renderWithIntl(
      <MarkdownPreview
        source={"# Guide\n\n## Install\n\nRun the installer."}
        onDocumentCaptureController={onDocumentCaptureController}
      />,
    );
    const text = screen.getByText("Run the installer.").firstChild as Text;
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    const controller = onDocumentCaptureController.mock.calls.at(-1)?.[0];
    expect(controller?.getSnapshot()).toMatchObject({
      kind: "selection",
      quote: "Run the installer.",
      locator: { label: "Install" },
    });
  });

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

  describe("loft:// image embedding", () => {
    it("renders loft:// image as <img src=/api/files/{id}/stream> wrapped in detail link", () => {
      renderWithIntl(<MarkdownPreview source="![caption](loft://abc123def456)" />);
      const img = document.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("/api/files/abc123def456/stream");
      expect(img?.getAttribute("alt")).toBe("caption");
      expect(img?.getAttribute("loading")).toBe("lazy");
      const link = img?.closest("a");
      expect(link).not.toBeNull();
      expect(link?.getAttribute("href")).toBe("/files/abc123def456");
      expect(link?.classList.contains("loft-image-link")).toBe(true);
    });

    it("renders loft:// image with empty alt", () => {
      renderWithIntl(<MarkdownPreview source="![](loft://abc123def456)" />);
      const img = document.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("/api/files/abc123def456/stream");
      expect(img?.getAttribute("alt")).toBe("");
    });

    it("ignores query params from loft:// image src (not meaningful for images)", () => {
      renderWithIntl(<MarkdownPreview source="![x](loft://abc123def456?t=30)" />);
      const img = document.querySelector("img");
      expect(img?.getAttribute("src")).toBe("/api/files/abc123def456/stream");
      expect(img?.closest("a")?.getAttribute("href")).toBe("/files/abc123def456");
    });

    it("renders invalid loft:// file_id as loft-image-invalid span", () => {
      renderWithIntl(<MarkdownPreview source="![bad](loft://../../evil)" />);
      expect(document.querySelector("img")).toBeNull();
      const span = document.querySelector(".loft-image-invalid");
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe("bad");
    });

    it("does not affect external URL images", () => {
      renderWithIntl(<MarkdownPreview source="![ext](https://example.com/a.png)" />);
      const img = document.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
      expect(document.querySelector(".loft-image-link")).toBeNull();
    });
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

  it("forwards onTagsSaved to the Properties Panel in standalone mode", () => {
    // Smoke test: the prop is piped through MarkdownPreview →
    // PropertiesPanel → EditableTagChips.onSaveSuccess. Rendering the
    // component tree without errors is enough for this layer; the
    // actual save-callback wiring is exercised in
    // EditableTagChips.test.tsx.
    const md = `---
tags: [a]
---
body`;
    renderWithIntl(
      <MarkdownPreview
        source={md}
        editable={{
          id: "fMd000000001",
          mime_type: "text/markdown",
          filename: "n.md",
          drive: "d",
        }}
        onTagsSaved={() => {}}
      />,
    );
    // The editable chip group renders an Add button.
    expect(screen.getByRole("button", { name: /Add tag/ })).toBeInTheDocument();
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

describe("MarkdownFileViewer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeResp(body: string, contentType = "text/plain") {
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  }

  // Route fetches by URL so the editable chip's getDriveTags side
  // effect doesn't consume our stream mocks. Returns a counter of
  // stream-URL hits for the assertions below.
  function routeByUrl() {
    let streamCalls = 0;
    fetchSpy.mockImplementation((url: string) => {
      const href = typeof url === "string" ? url : (url as URL).toString();
      if (href.includes("/tags")) {
        return Promise.resolve(makeResp("[]", "application/json"));
      }
      // Phase C (spec 2026-05-12 §3.8): MarkdownFileViewer now also
      // fetches wiki-link resolutions. Serve an empty map so it
      // doesn't count toward the stream-call total.
      if (href.includes("/wiki-resolutions")) {
        return Promise.resolve(
          makeResp(JSON.stringify({ resolutions: {} }), "application/json"),
        );
      }
      streamCalls += 1;
      return Promise.resolve(makeResp(`---\ntags: [v${streamCalls}]\n---\nbody\n`));
    });
    return () => streamCalls;
  }

  it("refetches source when externalReloadKey changes", async () => {
    // Regression guard for the bilateral chip-sync wiring: bumping the
    // parent's reload key must refetch the .md so the Properties
    // Panel's frontmatter display matches the post-save disk state.
    // Without this, editing the outer File.tags chip row on the file
    // detail page leaves the inner frontmatter chips stale until the
    // user navigates away.
    const getStreamCalls = routeByUrl();

    const { rerender } = renderWithIntl(
      <MarkdownFileViewer
        fileId="fMd000000001"
        editable={{ mime_type: "text/markdown", filename: "n.md", drive: "d" }}
        externalReloadKey={0}
      />,
    );
    await waitFor(() => expect(getStreamCalls()).toBe(1));

    rerender(
      <NextIntlClientProvider
        locale="en"
        messages={{ text: { loading: "Loading...", loadFailed: "Failed {error}" } }}
      >
        <MarkdownFileViewer
          fileId="fMd000000001"
          editable={{ mime_type: "text/markdown", filename: "n.md", drive: "d" }}
          externalReloadKey={1}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(getStreamCalls()).toBe(2));
  });

  it("does not refetch when externalReloadKey stays the same", async () => {
    const getStreamCalls = routeByUrl();

    const { rerender } = renderWithIntl(
      <MarkdownFileViewer fileId="f1" externalReloadKey={5} />,
    );
    await waitFor(() => expect(getStreamCalls()).toBe(1));

    // Re-render with the same key + identical props: useEffect deps
    // unchanged, so no second request.
    rerender(
      <NextIntlClientProvider
        locale="en"
        messages={{ text: { loading: "Loading...", loadFailed: "Failed {error}" } }}
      >
        <MarkdownFileViewer fileId="f1" externalReloadKey={5} />
      </NextIntlClientProvider>,
    );
    // Give any potential effect a tick.
    await new Promise((r) => setTimeout(r, 20));
    expect(getStreamCalls()).toBe(1);
  });
});
