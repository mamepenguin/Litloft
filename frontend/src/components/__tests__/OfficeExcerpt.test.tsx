import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfficeExcerpt } from "../OfficeExcerpt";
import { OFFICE_MIMES, OFFICE_PREVIEW_MAX_BYTES } from "@/lib/officeFiles";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(body: string, ok = true) {
  fetchMock = vi.fn().mockResolvedValue({ ok, text: async () => body });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => respondWith("Trade statistics, 2019 return\nSection A"));
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OfficeExcerpt", () => {
  it("shows the first lines of each of the three Office formats", async () => {
    for (const mime of [DOCX, XLSX, PPTX]) {
      const { unmount } = render(
        <OfficeExcerpt fileId="f1" mimeType={mime} fileSize={1024} />
      );
      expect(
        await screen.findByText(/Trade statistics, 2019 return/)
      ).toBeInTheDocument();
      unmount();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("covers exactly the formats the backend can extract", () => {
    expect([...OFFICE_MIMES].sort()).toEqual([DOCX, PPTX, XLSX].sort());
  });

  it("draws nothing when the extraction comes back empty", async () => {
    respondWith("   \n  ");
    render(<OfficeExcerpt fileId="f1" mimeType={DOCX} fileSize={1024} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("office-excerpt")).toBeNull();
  });

  it("draws nothing when the request fails", async () => {
    respondWith("", false);
    render(<OfficeExcerpt fileId="f1" mimeType={DOCX} fileSize={1024} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("office-excerpt")).toBeNull();
  });

  it("survives a rejected request", async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<OfficeExcerpt fileId="f1" mimeType={DOCX} fileSize={1024} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("office-excerpt")).toBeNull();
  });

  it("asks for nothing at all for a file that is not Office", async () => {
    render(
      <OfficeExcerpt fileId="f1" mimeType="application/octet-stream" fileSize={1024} />
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("office-excerpt")).toBeNull();
  });

  it("asks for nothing for an Office file over the size guard", async () => {
    render(
      <OfficeExcerpt
        fileId="f1"
        mimeType={XLSX}
        fileSize={OFFICE_PREVIEW_MAX_BYTES + 1}
      />
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still asks at exactly the guard", async () => {
    render(
      <OfficeExcerpt fileId="f1" mimeType={XLSX} fileSize={OFFICE_PREVIEW_MAX_BYTES} />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("is a read-only excerpt, not a viewer", async () => {
    render(<OfficeExcerpt fileId="f1" mimeType={DOCX} fileSize={1024} />);
    const section = await screen.findByTestId("office-excerpt");

    for (const el of [section, ...section.querySelectorAll("*")]) {
      expect(el.className).not.toContain("overflow");
      expect(el.className).not.toContain("max-h-");
    }
    expect(section.querySelectorAll("button").length).toBe(0);
    expect(section.querySelector("p")?.className).toContain("line-clamp-10");
  });
});


describe("OfficeExcerpt across files", () => {
  const DOCX2 = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  it("does not leave the previous file's text under the next file's name", async () => {
    respondWith("Document A");
    const { rerender } = render(
      <OfficeExcerpt fileId="a" mimeType={DOCX2} fileSize={1024} />
    );
    expect(await screen.findByText("Document A")).toBeInTheDocument();

    fetchMock = vi.fn(() => new Promise(() => {}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    rerender(<OfficeExcerpt fileId="b" mimeType={DOCX2} fileSize={1024} />);
    expect(screen.queryByText("Document A")).toBeNull();

    respondWith("", false);
    rerender(<OfficeExcerpt fileId="c" mimeType={DOCX2} fileSize={1024} />);
    await waitFor(() => expect(screen.queryByTestId("office-excerpt")).toBeNull());
  });

  it("asks for nothing about a file the scanner can no longer find", () => {
    render(<OfficeExcerpt fileId="a" mimeType={DOCX2} fileSize={1024} missing />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abandons the extraction when the reader moves on", async () => {
    const signals: AbortSignal[] = [];
    fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise(() => {});
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { unmount } = render(
      <OfficeExcerpt fileId="a" mimeType={DOCX2} fileSize={1024} />
    );
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[0].aborted).toBe(true);
  });
});
