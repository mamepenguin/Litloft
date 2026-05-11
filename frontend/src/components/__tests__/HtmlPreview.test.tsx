import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { HtmlPreview } from "../HtmlPreview";

vi.mock("@/lib/api", () => ({
  getRenderUrl: (id: string) => `/api/files/${id}/render`,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HtmlPreview", () => {
  it("renders an iframe pointing at the render endpoint", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("/api/files/abc123def456/render");
  });

  it("uses a sandbox without allow-same-origin", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview");
    const sandbox = iframe.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  it("updates iframe height on litloft:height messages from the iframe", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;
    expect(iframe.style.height).toBe("480px");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "litloft:height", value: 1234 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(iframe.style.height).toBe("1234px");
  });

  it("ignores messages from other sources", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "litloft:height", value: 9999 },
          source: window,
        }),
      );
    });

    expect(iframe.style.height).toBe("480px");
  });

  it("ignores messages with non-finite or non-positive values", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;

    for (const value of [NaN, -100, 0, "tall"]) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { type: "litloft:height", value },
            source: iframe.contentWindow,
          }),
        );
      });
    }

    expect(iframe.style.height).toBe("480px");
  });

  it("ignores messages with the wrong type", () => {
    render(<HtmlPreview fileId="abc123def456" />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "something-else", value: 9999 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(iframe.style.height).toBe("480px");
  });

  it("renders fullscreen mode with viewport-height iframe and hash", () => {
    render(<HtmlPreview fileId="abc123def456" fullscreen />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe(
      "/api/files/abc123def456/render#litloft-fullscreen",
    );
    expect(iframe.style.height).toBe("100dvh");
  });

  it("does not listen for height messages in fullscreen mode", () => {
    render(<HtmlPreview fileId="abc123def456" fullscreen />);
    const iframe = screen.getByTitle("HTML preview") as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "litloft:height", value: 2222 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(iframe.style.height).toBe("100dvh");
  });
});
