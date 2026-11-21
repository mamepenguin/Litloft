import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

import { FilePreview } from "../FilePreview";
import { OFFICE_PREVIEW_MAX_BYTES } from "@/lib/officeFiles";
import {
  InertResizeObserver,
  idOfBody,
  installNetwork,
  officeFile,
  type Network,
} from "@/__tests__/helpers/officeViewer";
import { notTakenByTheViewer } from "@/__tests__/helpers/officeLazyLoadCases";

/** Counts module evaluations: a factory runs when its module is first imported. */
const loaded = vi.hoisted(() => ({ docx: 0, excel: 0, excelCss: 0 }));

vi.mock("docx-preview", () => {
  loaded.docx += 1;
  const api = {
    renderAsync: async (data: unknown, container: HTMLElement) => {
      const el = document.createElement("div");
      el.textContent = `drawn:${await idOfBody(data)}`;
      container.append(el);
    },
  };
  return { ...api, default: api };
});
vi.mock("@js-preview/excel", () => {
  loaded.excel += 1;
  const api = { init: () => ({ preview: async () => {}, destroy: () => {} }) };
  return { ...api, default: api };
});
vi.mock("@js-preview/excel/lib/index.css", () => {
  loaded.excelCss += 1;
  return { default: "" };
});

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getPreviewTextUrl: (id: string) => `/api/files/${id}/preview-text`,
}));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../VideoPlayer", () => ({ VideoPlayer: () => <div data-testid="video-player" /> }));
vi.mock("../PdfPreview", () => ({ PdfPreview: () => <div data-testid="pdf-preview" /> }));

let net: Network;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", InertResizeObserver);
  net = installNetwork();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-029 I4 I5 docx-preview is loaded only for a Word file the viewer takes", () => {
  it("no other file loads either library, and a Word file loads docx-preview without the Excel library or stylesheet", async () => {
    for (const file of notTakenByTheViewer()) {
      const { unmount } = render(<FilePreview file={file} />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      unmount();
    }
    expect(loaded).toEqual({ docx: 0, excel: 0, excelCss: 0 });
    expect(net.streamCalls()).toHaveLength(0);

    render(
      <FilePreview file={officeFile({ id: "doc-a", file_size: OFFICE_PREVIEW_MAX_BYTES })} />,
    );
    expect(
      await within(screen.getByRole("region", { name: "Document" })).findByText("drawn:doc-a"),
    ).toBeInTheDocument();
    expect(loaded).toEqual({ docx: 1, excel: 0, excelCss: 0 });
  });
});
