import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";

import { FilePreview } from "../FilePreview";
import { OFFICE_PREVIEW_MAX_BYTES } from "@/lib/officeFiles";
import {
  FALLBACK_HEADING,
  InertResizeObserver,
  PPTX_MIME,
  XLSX_MIME,
  drawnBy,
  drawnNow,
  excerptOf,
  idOfBody,
  idOfBodySync,
  installNetwork,
  officeFile,
  warnings,
  type Network,
} from "@/__tests__/helpers/officeViewer";

const lib = vi.hoisted(() => ({
  renderAsync: vi.fn(),
  init: vi.fn(),
}));

vi.mock("docx-preview", () => {
  const api = {
    renderAsync: (...args: unknown[]) => lib.renderAsync(...args),
  };
  return { ...api, default: api };
});

vi.mock("@js-preview/excel", () => {
  const api = { init: (...args: unknown[]) => lib.init(...args) };
  return { ...api, default: api };
});

vi.mock("@js-preview/excel/lib/index.css", () => ({ default: "" }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getPreviewTextUrl: (id: string) => `/api/files/${id}/preview-text`,
}));

vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

const XLSX = (overrides = {}) =>
  officeFile({ id: "sheet-a", filename: "plan.xlsx", mime_type: XLSX_MIME, ...overrides });
const DOCX = (overrides = {}) => officeFile({ id: "doc-a", ...overrides });

let net: Network;
let warn: ReturnType<typeof vi.spyOn>;
let excelInstances: { preview: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[];
/** For every draw call, the file it drew and what was already drawn on the page when it started. */
let draws: { id: string; before: string[] }[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", InertResizeObserver);
  net = installNetwork();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  excelInstances = [];
  draws = [];
  lib.renderAsync.mockReset();
  lib.renderAsync.mockImplementation(async (data: unknown, container: HTMLElement) => {
    const before = drawnNow();
    const id = await idOfBody(data);
    draws.push({ id, before });
    container.append(drawnBy(id));
  });
  lib.init.mockReset();
  lib.init.mockImplementation((container: HTMLElement) => {
    const instance = {
      preview: vi.fn(async (data: unknown) => {
        const before = drawnNow();
        const id = await idOfBody(data);
        draws.push({ id, before });
        const grid = drawnBy(id, " sheet tabs");
        grid.className = "x-spreadsheet";
        container.append(grid);
      }),
      destroy: vi.fn(),
    };
    excelInstances.push(instance);
    return instance;
  });
});

afterEach(() => {
  warn.mockRestore();
  vi.unstubAllGlobals();
});

const region = () => screen.getByRole("region", { name: "Document" });
const queryRegion = () => screen.queryByRole("region", { name: "Document" });

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function expectFallback(id: string) {
  expect(
    await screen.findByRole("heading", { name: FALLBACK_HEADING }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in new tab" })).toBeInTheDocument();
  expect(await screen.findByText(excerptOf(id))).toBeInTheDocument();
}

describe("SPEC-CORE-029 I1 a Word file is drawn by docx-preview", () => {
  it("draws the document inside the Document region, with no fallback panel", async () => {
    render(<FilePreview file={DOCX()} />);

    expect(await within(region()).findByText("drawn:doc-a")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: FALLBACK_HEADING })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open in new tab" })).not.toBeInTheDocument();
    expect(lib.init).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

});

describe("SPEC-CORE-155 I2 an Excel file is drawn by @js-preview/excel", () => {
  it("initialises the grid in the region without a context menu and previews the fetched bytes", async () => {
    render(<FilePreview file={XLSX()} />);

    expect(await within(region()).findByText("drawn:sheet-a sheet tabs")).toBeInTheDocument();
    expect(lib.init).toHaveBeenCalledTimes(1);
    const [container, options] = lib.init.mock.calls[0];
    expect(region().contains(container as Node)).toBe(true);
    expect(options).toMatchObject({ showContextmenu: false });
    const previewed = excelInstances[0].preview;
    expect(previewed.mock.calls).toHaveLength(1);
    expect(idOfBodySync(previewed.mock.calls[0][0])).toBe("sheet-a");
    expect(screen.queryByRole("heading", { name: FALLBACK_HEADING })).not.toBeInTheDocument();
    expect(lib.renderAsync).not.toHaveBeenCalled();
  });

  it("gets the viewer at exactly the cap", async () => {
    render(<FilePreview file={XLSX({ file_size: OFFICE_PREVIEW_MAX_BYTES })} />);
    expect(await within(region()).findByText("drawn:sheet-a sheet tabs")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-029 SPEC-CORE-155 I4 files the viewer does not take keep today's panel", () => {
  it.each([
    ["a .pptx", officeFile({ id: "x", filename: "deck.pptx", mime_type: PPTX_MIME })],
    ["a .docx one byte over the cap", DOCX({ id: "x", file_size: OFFICE_PREVIEW_MAX_BYTES + 1 })],
    ["a missing .xlsx", XLSX({ id: "x", missing_since: "2026-02-01T00:00:00Z" })],
  ])("%s renders the panel without fetching its stream or drawing", async (_, file) => {
    const { unmount } = render(<FilePreview file={file} />);
    expect(await screen.findByRole("heading", { name: FALLBACK_HEADING })).toBeInTheDocument();
    await settle();
    expect(queryRegion()).not.toBeInTheDocument();
    expect(net.streamCalls()).toHaveLength(0);
    expect(lib.renderAsync).not.toHaveBeenCalled();
    expect(lib.init).not.toHaveBeenCalled();
    unmount();

    // The same page with a file the viewer does take: the absence above is the branch, not a dead viewer.
    render(<FilePreview file={DOCX({ id: "y" })} />);
    expect(await within(region()).findByText("drawn:y")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-029 SPEC-CORE-155 I3 a failure falls back to today's panel", () => {
  const cases: [string, () => ReturnType<typeof DOCX>, () => void][] = [
    ["Word: the stream answers 410", () => DOCX(), () => net.failStream("doc-a", 410)],
    [
      "Excel: preview rejects after drawing part of the workbook",
      () => XLSX(),
      () =>
        lib.init.mockImplementation((container: HTMLElement) => ({
          preview: async () => {
            container.append(drawnBy("sheet-a", " partial"));
            throw new Error("corrupt workbook");
          },
          destroy: vi.fn(),
        })),
    ],
  ];

  it.each(cases)("%s", async (_, make, arrange) => {
    arrange();
    const file = make();
    render(<FilePreview file={file} />);

    await expectFallback(file.id);
    expect(net.streamCalls(file.id).length + lib.init.mock.calls.length).toBeGreaterThan(0);
    expect(net.streamCalls(file.id).length).toBeLessThanOrEqual(1);
    expect(screen.queryByText(/^drawn:/)).not.toBeInTheDocument();
    await settle();
    const logged = warnings(warn);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(file.id);
  });

});

describe("SPEC-CORE-029 SPEC-CORE-155 I11 the viewer requests only the stream", () => {
  it.each([
    ["Excel", XLSX(), "drawn:sheet-a sheet tabs"],
  ])("%s: a shown file made one stream request and never asked for the excerpt", async (_, file, drawn) => {
    render(<FilePreview file={file} />);
    await within(region()).findByText(drawn);
    await settle();
    expect(net.log).toEqual([`stream:${file.id}`]);
  });
});

describe("SPEC-CORE-029 SPEC-CORE-155 I6 a new identity replaces the old drawing", () => {
  it("removes a shown Word drawing before the next file's bytes arrive", async () => {
    const { rerender } = render(<FilePreview file={DOCX()} />);
    await within(region()).findByText("drawn:doc-a");

    const held = net.holdStream("doc-b");
    rerender(<FilePreview file={DOCX({ id: "doc-b" })} />);
    expect(screen.queryByText("drawn:doc-a")).not.toBeInTheDocument();
    await waitFor(() => expect(net.streamCalls("doc-b")).toHaveLength(1));
    expect(screen.queryByText("drawn:doc-a")).not.toBeInTheDocument();
    expect(region()).toBeInTheDocument();

    await act(async () => held.respond());
    expect(await within(region()).findByText("drawn:doc-b")).toBeInTheDocument();
    expect(screen.queryByText("drawn:doc-a")).not.toBeInTheDocument();
    expect(draws.find((d) => d.id === "doc-b")?.before).toEqual([]);
  });

  it("aborts a pending fetch for the previous file, and its late answer changes nothing", async () => {
    const heldA = net.holdStream("doc-a");
    const { rerender } = render(<FilePreview file={DOCX()} />);
    await waitFor(() => expect(net.streamCalls("doc-a")).toHaveLength(1));
    const signalA = net.streamCalls("doc-a")[0].init?.signal;

    rerender(<FilePreview file={DOCX({ id: "doc-b" })} />);
    expect(await within(region()).findByText("drawn:doc-b")).toBeInTheDocument();
    expect(signalA?.aborted).toBe(true);

    await act(async () => heldA.respond());
    await settle();
    expect(screen.queryByText("drawn:doc-a")).not.toBeInTheDocument();
    expect(screen.getByText("drawn:doc-b")).toBeInTheDocument();
    expect(lib.renderAsync).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["file_size", { file_size: 8192 }],
  ])("loads again when the same id comes back with another %s", async (_, change) => {
    const { rerender } = render(<FilePreview file={DOCX()} />);
    await within(region()).findByText("drawn:doc-a");

    rerender(<FilePreview file={DOCX(change)} />);
    await waitFor(() => expect(net.streamCalls("doc-a")).toHaveLength(2));
    await waitFor(() => expect(lib.renderAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("drawn:doc-a")).toHaveLength(1));
  });

});

describe("SPEC-CORE-029 SPEC-CORE-155 I7 an unchanged identity is not loaded again", () => {
  it.each([
    ["Word", DOCX, "drawn:doc-a"],
    ["Excel", XLSX, "drawn:sheet-a sheet tabs"],
  ] as const)(
    "%s: a re-render, an equal file object and a resize neither fetch nor draw again",
    async (_, make, drawn) => {
      const { rerender } = render(<FilePreview file={make()} />);
      await within(region()).findByText(drawn);

      rerender(<FilePreview file={make()} />);
      rerender(<FilePreview file={make({ title: "Renamed title", tags: ["x"] })} />);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      await settle();

      expect(net.streamCalls()).toHaveLength(1);
      expect(lib.renderAsync.mock.calls.length + lib.init.mock.calls.length).toBe(1);
      expect(screen.getAllByText(drawn)).toHaveLength(1);
    },
  );

});

describe("SPEC-CORE-029 I14 web links in a Word drawing open in a new tab", () => {
  it("adds target and rel to http and https links and leaves every other link as drawn", async () => {
    lib.renderAsync.mockImplementation(async (_: unknown, container: HTMLElement) => {
      const hrefs = [
        "http://example.com/a",
        "https://example.com/b",
        "#_Toc123",
        "mailto:someone@example.com",
        "file:///C:/docs/x.docx",
      ];
      const section = document.createElement("section");
      section.textContent = "drawn:doc-a";
      for (const href of hrefs) {
        const a = document.createElement("a");
        a.setAttribute("href", href);
        a.textContent = `link ${href}`;
        section.append(a);
      }
      container.append(section);
    });
    render(<FilePreview file={DOCX()} />);
    await within(region()).findByText(/drawn:doc-a/);

    const link = (href: string) => screen.getByText(`link ${href}`);
    await waitFor(() =>
      expect(link("http://example.com/a")).toHaveAttribute("target", "_blank"),
    );
    for (const href of ["http://example.com/a", "https://example.com/b"]) {
      expect(link(href)).toHaveAttribute("target", "_blank");
      expect(link(href)).toHaveAttribute("rel", "noopener noreferrer");
      expect(link(href).getAttribute("href")).toBe(href);
    }
    for (const href of ["#_Toc123", "mailto:someone@example.com", "file:///C:/docs/x.docx"]) {
      expect(link(href)).not.toHaveAttribute("target");
      expect(link(href)).not.toHaveAttribute("rel");
      expect(link(href).getAttribute("href")).toBe(href);
    }
  });
});
