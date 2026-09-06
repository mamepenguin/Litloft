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
    // The set is the whole population, asserted rather than sampled: a
    // fourth mime added here without a backend branch would draw an empty
    // section for a format that can never fill it.
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
    // The count, not the absence of a section: a fetch that happens and is
    // then discarded still opens the file on the backend.
    render(
      <OfficeExcerpt fileId="f1" mimeType="application/octet-stream" fileSize={1024} />
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("office-excerpt")).toBeNull();
  });

  it("asks for nothing for an Office file over the size guard", async () => {
    // `/preview-text` opens the file every time and `openpyxl` takes seconds
    // on a large workbook.
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
    // The boundary belongs to the allowed side, and saying so is what keeps
    // the guard from being read as "under 20MB" and drifting.
    render(
      <OfficeExcerpt fileId="f1" mimeType={XLSX} fileSize={OFFICE_PREVIEW_MAX_BYTES} />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("is a read-only excerpt, not a viewer", async () => {
    render(<OfficeExcerpt fileId="f1" mimeType={DOCX} fileSize={1024} />);
    const section = await screen.findByTestId("office-excerpt");

    // No scrolling and no page turning: the whole claim of §10 is that this
    // does not become a viewer, and a scroll container is the first step.
    expect(section.className).not.toContain("overflow");
    expect(section.querySelectorAll("button").length).toBe(0);
    expect(section.querySelector("p")?.className).toContain("line-clamp-10");
  });
});
