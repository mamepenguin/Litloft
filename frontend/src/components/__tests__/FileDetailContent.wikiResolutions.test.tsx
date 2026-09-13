import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * `MarkdownPreview` is not mocked: it re-exports `MarkdownFileViewer` from a
 * sibling that imports it back, so the sibling would get the real module
 * rather than the mock. Assertions read the real DOM instead.
 */

const { MarkdownFileViewer } = await import("@/components/MarkdownPreview");

describe("MarkdownFileViewer + wiki resolutions wiring", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function routeFetches(opts: {
    streamBody?: string;
    resolutionsBody?: unknown;
    resolutionsStatus?: number;
    resolutionsRejection?: Error;
  } = {}) {
    let streamCalls = 0;
    let resolutionCalls = 0;
    fetchMock.mockImplementation((url: string | URL) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("/wiki-resolutions")) {
        resolutionCalls += 1;
        if (opts.resolutionsRejection)
          return Promise.reject(opts.resolutionsRejection);
        const body = opts.resolutionsBody ?? { resolutions: {} };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: opts.resolutionsStatus ?? 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (href.includes("/tags")) {
        return Promise.resolve(
          new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      streamCalls += 1;
      return Promise.resolve(
        new Response(opts.streamBody ?? "# Note\n[[Alpha]]\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );
    });
    return {
      getStreamCalls: () => streamCalls,
      getResolutionCalls: () => resolutionCalls,
    };
  }

  it("fetches wiki resolutions on mount and forwards them to MarkdownPreview", async () => {
    const { getResolutionCalls } = routeFetches({
      streamBody: "# Note\nLink [[Alpha]]",
      resolutionsBody: {
        resolutions: {
          Alpha: { kind: "resolved", file_id: "abcdef123456" },
        },
      },
    });

    const { container } = render(<MarkdownFileViewer fileId="fMd000000001" />);

    await waitFor(() => expect(getResolutionCalls()).toBe(1));
    await waitFor(() => {
      const link = container.querySelector<HTMLAnchorElement>(
        'a.wiki-link[data-wiki-target="Alpha"]',
      );
      expect(link).not.toBeNull();
      expect(link!.classList.contains("wiki-resolved")).toBe(true);
      expect(link!.getAttribute("href")).toBe("/files/abcdef123456");
    });
  });

  it("renders the preview immediately without waiting for resolutions", async () => {
    let resolveResolutions!: (r: Response) => void;
    fetchMock.mockImplementation((url: string | URL) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("/wiki-resolutions")) {
        return new Promise<Response>((res) => {
          resolveResolutions = res;
        });
      }
      if (href.includes("/tags")) {
        return Promise.resolve(new Response("[]"));
      }
      return Promise.resolve(new Response("# body\n[[X]]\n"));
    });

    const { container } = render(<MarkdownFileViewer fileId="fMd000000001" />);

    await waitFor(() => {
      const span = container.querySelector(
        'span.wiki-link[data-wiki-target="X"]',
      );
      expect(span).not.toBeNull();
      expect(span!.classList.contains("wiki-unresolved")).toBe(true);
    });

    resolveResolutions(
      new Response(
        JSON.stringify({
          resolutions: { X: { kind: "resolved", file_id: "xid000000001" } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await waitFor(() => {
      const link = container.querySelector<HTMLAnchorElement>(
        'a.wiki-link[data-wiki-target="X"]',
      );
      expect(link).not.toBeNull();
      expect(link!.classList.contains("wiki-resolved")).toBe(true);
      expect(link!.getAttribute("href")).toBe("/files/xid000000001");
    });
  });

  it("renders the preview without resolutions when the fetch fails", async () => {
    routeFetches({
      streamBody: "[[Foo]]",
      resolutionsRejection: new Error("network down"),
    });
    const { container } = render(<MarkdownFileViewer fileId="fMd000000001" />);

    await waitFor(() => {
      const span = container.querySelector(
        'span.wiki-link[data-wiki-target="Foo"]',
      );
      expect(span).not.toBeNull();
      expect(span!.classList.contains("wiki-unresolved")).toBe(true);
    });
  });

  it("re-fetches resolutions when externalReloadKey bumps", async () => {
    const { getResolutionCalls } = routeFetches({
      resolutionsBody: { resolutions: {} },
    });

    const { rerender } = render(
      <MarkdownFileViewer fileId="fMd000000001" externalReloadKey={0} />,
    );
    await waitFor(() => expect(getResolutionCalls()).toBe(1));

    rerender(
      <MarkdownFileViewer fileId="fMd000000001" externalReloadKey={1} />,
    );
    await waitFor(() => expect(getResolutionCalls()).toBe(2));
  });

  it("does not re-fetch resolutions when nothing changed", async () => {
    const { getResolutionCalls } = routeFetches({
      resolutionsBody: { resolutions: {} },
    });

    const { rerender } = render(
      <MarkdownFileViewer fileId="fMd000000001" externalReloadKey={5} />,
    );
    await waitFor(() => expect(getResolutionCalls()).toBe(1));

    rerender(
      <MarkdownFileViewer fileId="fMd000000001" externalReloadKey={5} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(getResolutionCalls()).toBe(1);
  });

  it("fetches resolutions from the correct URL with credentials", async () => {
    routeFetches();
    render(<MarkdownFileViewer fileId="fMd000000001" />);
    await waitFor(() => {
      const found = fetchMock.mock.calls.some((call) => {
        const url = typeof call[0] === "string" ? call[0] : call[0].toString();
        return url.includes("/api/files/fMd000000001/wiki-resolutions");
      });
      expect(found).toBe(true);
    });
    const resolutionCall = fetchMock.mock.calls.find((call) => {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString();
      return url.includes("/wiki-resolutions");
    });
    expect(resolutionCall).toBeDefined();
    const opts = resolutionCall![1] as RequestInit | undefined;
    expect(opts?.credentials).toBe("include");
  });
});
