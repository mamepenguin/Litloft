import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";

import { FilePreview } from "../FilePreview";
import {
  FALLBACK_HEADING,
  XLSX_MIME,
  drawnBy,
  idOfBody,
  installNetwork,
  officeFile,
} from "@/__tests__/helpers/officeViewer";

const lib = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("docx-preview", () => {
  const api = { renderAsync: async () => {} };
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

const K = 1.333333;

type Datas = unknown;
type Sizes = unknown[];

/**
 * A library instance shaped like @js-preview/excel's: `xs` is the x-spreadsheet
 * grid, `xs.datas` holds one entry per sheet once `preview` has loaded the
 * workbook, and `xs.sheet.reload` redraws the sheet on screen.
 */
interface Drawing {
  xs: { datas: Datas; sheet: { data: unknown; reload: () => void; resetData: (d: unknown) => void } };
  destroy: ReturnType<typeof vi.fn>;
  /** The font sizes `sizes()` read at every reload made after `preview` resolved. */
  reloadsAfterPreview: Sizes[];
}

let drawings: Drawing[];
let observers: FiringResizeObserver[];
let consoleSpies: ReturnType<typeof vi.spyOn>[];

class FiringResizeObserver {
  disconnected = false;
  constructor(public cb: ResizeObserverCallback) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

/**
 * Installs a library whose `preview` loads `load(n)` into `xs.datas` for the
 * n-th drawing, and whose reloads record `sizes()` as they see it.
 */
function installLibrary(load: (index: number) => Datas, sizes: (datas: Datas) => Sizes) {
  lib.init.mockImplementation((container: HTMLElement) => {
    let previewed = false;
    const index = drawings.length;
    const drawing: Drawing = {
      xs: {
        datas: [],
        sheet: {
          data: undefined,
          reload: () => {
            if (previewed) drawing.reloadsAfterPreview.push(sizes(drawing.xs.datas));
          },
          resetData: (d: unknown) => {
            drawing.xs.sheet.data = d;
          },
        },
      },
      destroy: vi.fn(),
      reloadsAfterPreview: [],
    };
    drawings.push(drawing);
    return {
      xs: drawing.xs,
      preview: async (data: unknown) => {
        const id = await idOfBody(data);
        drawing.xs.datas = load(index);
        const datas = drawing.xs.datas;
        if (Array.isArray(datas)) drawing.xs.sheet.data = datas[0];
        const grid = drawnBy(id, " sheet tabs");
        grid.className = "x-spreadsheet";
        container.append(grid);
        previewed = true;
      },
      destroy: drawing.destroy,
    };
  });
}

/**
 * Three sheets the way the library loads them: fonts with and without a numeric
 * size, one font object shared by two styles on two sheets, styles without a
 * font, and row heights and column widths. `size` maps each numeric size, so
 * `workbook(n => n * K)` is the expected result of correcting `workbook()`.
 */
function workbook(size: (n: number) => number = (n) => n) {
  const shared = { name: "MS Gothic", size: size(6) };
  const twin = { name: "MS Gothic", size: size(6) };
  const small = { name: "Calibri", size: size(5), bold: true };
  const body = { name: "Calibri", size: size(11), italic: true, color: "#ff0000" };
  const second = { name: "Arial", size: size(8), underline: true };
  const unsized = { name: "Arial", bold: true };
  const textSized = { name: "Arial", size: "10" };
  const nullSized = { name: "Arial", size: null };
  const datas = [
    {
      name: "Sheet1",
      styles: [
        { font: small, align: "left", valign: "middle", textwrap: true },
        { font: shared, bgcolor: "#eeeeee" },
        { font: body, border: { top: ["thin", "#000000"] } },
        { align: "center" },
        { font: unsized },
        { font: textSized },
        { font: nullSized },
        { font: shared, align: "right" },
      ],
      rows: {
        len: 3,
        0: { height: 20, cells: { 0: { text: "a", style: 0 }, 1: { text: "b", style: 1 } } },
        1: { height: 45, cells: { 0: { text: "c", style: 2 } } },
      },
      cols: { len: 4, 0: { width: 64 }, 1: { width: 120 } },
      merges: ["A1:B1"],
    },
    {
      name: "Sheet2",
      styles: [{ font: shared }, { font: second, valign: "top" }, { font: twin }],
      rows: { len: 1, 0: { height: 15, cells: { 0: { text: "d", style: 1 } } } },
      cols: { len: 1, 0: { width: 80 } },
    },
    { name: "Sheet3", styles: [], rows: { len: 0 }, cols: { len: 0 } },
  ];
  return { datas, fonts: { shared, twin, small, body, second, unsized, textSized, nullSized } };
}

/** The `size` of every font object in `workbook()`'s datas, by walking them. */
function sizesOf(datas: Datas): Sizes {
  if (!Array.isArray(datas)) return [];
  return datas.flatMap((sheet: { styles?: unknown }) =>
    Array.isArray(sheet?.styles)
      ? sheet.styles.map((s: { font?: { size?: unknown } } | null) =>
          s && typeof s === "object" && s.font && typeof s.font === "object" ? s.font.size : "-",
        )
      : [],
  );
}

const CORRECTED_SIZES = sizesOf(workbook((n) => n * K).datas);

const XLSX = (overrides = {}) =>
  officeFile({ id: "sheet-a", filename: "plan.xlsx", mime_type: XLSX_MIME, ...overrides });

const region = () => screen.getByRole("region", { name: "Document" });

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function shown(id = "sheet-a") {
  expect(await within(region()).findByText(`drawn:${id} sheet tabs`)).toBeInTheDocument();
  await settle();
}

function expectNoConsole() {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
}

function expectShownWithoutFallback(drawing: Drawing) {
  expect(screen.getByText("drawn:sheet-a sheet tabs")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: FALLBACK_HEADING })).not.toBeInTheDocument();
  expect(drawing.destroy).not.toHaveBeenCalled();
}

beforeEach(() => {
  drawings = [];
  observers = [];
  vi.stubGlobal("ResizeObserver", FiringResizeObserver);
  installNetwork();
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  lib.init.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-167 I1 I3 every sheet's font sizes are multiplied by the literal 1.333333", () => {
  it("multiplies each numeric font size once, shared fonts included, and leaves everything else as loaded", async () => {
    let loaded!: ReturnType<typeof workbook>;
    installLibrary(() => {
      loaded = workbook();
      return loaded.datas;
    }, sizesOf);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(drawings[0].xs.datas).toEqual(workbook((n) => n * K).datas);
    expect(loaded.fonts.shared.size).toBe(6 * K);
    expect(loaded.fonts.shared.size).not.toBe(8);
    expect(loaded.fonts.twin.size).toBe(6 * K);
    expect(loaded.fonts.small.size).toBe(5 * K);
    expect(loaded.fonts.second.size).toBe(8 * K);
    expect(loaded.fonts.textSized.size).toBe("10");
    expect(loaded.fonts.nullSized.size).toBeNull();
    expect("size" in loaded.fonts.unsized).toBe(false);
  });

  it("corrects a workbook with a single sheet and a single style", async () => {
    const font = { size: 9 };
    installLibrary(() => [{ name: "Only", styles: [{ font }] }], sizesOf);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(font.size).toBe(9 * K);
  });
});

describe("SPEC-CORE-167 I4 the first reload after preview already sees the corrected sizes", () => {
  it("records corrected sizes at the first reload of the grid's sheet", async () => {
    installLibrary(() => workbook().datas, sizesOf);
    render(<FilePreview file={XLSX()} />);
    await shown();

    const reloads = drawings[0].reloadsAfterPreview;
    expect(reloads.length).toBeGreaterThanOrEqual(1);
    expect(reloads[0]).toEqual(CORRECTED_SIZES);
  });
});

describe("SPEC-CORE-167 I2 the correction is applied once per drawing", () => {
  it("leaves the corrected sizes alone through reloads, frame resizes, window resizes, re-renders and a sheet switch", async () => {
    installLibrary(() => workbook().datas, sizesOf);
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();
    const drawing = drawings[0];
    const reloadsBefore = drawing.reloadsAfterPreview.length;

    act(() => {
      drawing.xs.sheet.reload();
      drawing.xs.sheet.reload();
    });
    act(() => {
      for (const o of observers.filter((o) => !o.disconnected)) {
        o.cb([], o as unknown as ResizeObserver);
      }
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    rerender(<FilePreview file={XLSX({ title: "Renamed" })} />);
    act(() => {
      const datas = drawing.xs.datas as unknown[];
      drawing.xs.sheet.resetData(datas[1]);
      drawing.xs.sheet.reload();
      drawing.xs.sheet.resetData(datas[0]);
      drawing.xs.sheet.reload();
    });
    await waitFor(() =>
      expect(drawing.reloadsAfterPreview.length).toBeGreaterThanOrEqual(reloadsBefore + 5),
    );
    await settle();

    expect(sizesOf(drawing.xs.datas)).toEqual(CORRECTED_SIZES);
    for (const seen of drawing.reloadsAfterPreview) expect(seen).toEqual(CORRECTED_SIZES);
    expect(lib.init).toHaveBeenCalledTimes(1);
  });

  it("a new identity gets its own library instance and its own single correction", async () => {
    installLibrary(() => workbook().datas, sizesOf);
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
    await shown("sheet-b");

    expect(drawings).toHaveLength(2);
    expect(sizesOf(drawings[1].xs.datas)).toEqual(CORRECTED_SIZES);
    expect(sizesOf(drawings[0].xs.datas)).toEqual(CORRECTED_SIZES);
  });
});

describe("SPEC-CORE-167 I5 a workbook the correction cannot read is still shown", () => {
  /** The same page with a readable workbook: the guard assertions above are not a correction that never runs. */
  async function nextWorkbookIsCorrected(rerender: (ui: React.ReactElement) => void) {
    rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
    await shown("sheet-b");
    expect(sizesOf(drawings.at(-1)!.xs.datas)).toEqual(CORRECTED_SIZES);
  }

  it("skips styles of unexpected shape and corrects the rest", async () => {
    const good = { size: 9 };
    const alsoGood = { size: 14 };
    const textSized = { size: "8" };
    const nullSized = { size: null };
    const unsized = { name: "Arial" };
    installLibrary(
      () => [
        { name: "NoStyles" },
        { name: "StylesNotArray", styles: "x" },
        {
          name: "Odd",
          styles: [
            null,
            3,
            "s",
            {},
            { font: null },
            { font: 7 },
            { font: textSized },
            { font: nullSized },
            { font: unsized },
            { font: good },
          ],
        },
        { name: "Last", styles: [{ font: alsoGood }] },
      ],
      () => [],
    );
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(good.size).toBe(9 * K);
    expect(alsoGood.size).toBe(14 * K);
    expect(textSized.size).toBe("8");
    expect(nullSized.size).toBeNull();
    expect("size" in unsized).toBe(false);
    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
  });

  it("xs is missing: shown as the library draws it, with no fallback, dispose or log", async () => {
    installLibrary(() => workbook().datas, sizesOf);
    lib.init.mockImplementationOnce((container: HTMLElement) => {
      const drawing = { destroy: vi.fn() } as unknown as Drawing;
      drawings.push(drawing);
      return {
        preview: async (data: unknown) => {
          container.append(drawnBy(await idOfBody(data), " sheet tabs"));
        },
        destroy: drawing.destroy,
      };
    });
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
    await nextWorkbookIsCorrected(rerender);
  });

  const oddDatas: [string, () => Datas][] = [
    ["xs.datas is missing", () => undefined],
    ["xs.datas is a string", () => "sheets"],
  ];
  it.each(oddDatas)("%s: shown as the library draws it, with no fallback, dispose or log", async (_, odd) => {
    installLibrary((i) => (i === 0 ? odd() : workbook().datas), sizesOf);
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
    await nextWorkbookIsCorrected(rerender);
  });

  it("xs.datas is an object: nothing in it is corrected, and the workbook is shown", async () => {
    const font = { size: 6 };
    installLibrary(
      (i) => (i === 0 ? { length: 1, 0: { name: "S", styles: [{ font }] } } : workbook().datas),
      sizesOf,
    );
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    expect(font.size).toBe(6);
    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
    await nextWorkbookIsCorrected(rerender);
  });

  it("a correction that throws partway leaves each size loaded or corrected once, and the workbook shown", async () => {
    const first = { size: 6 };
    const last = { size: 8 };
    let trapsHit = 0;
    const throwingStyles = {
      name: "Throws",
      get styles(): unknown {
        trapsHit += 1;
        throw new Error("unreadable styles");
      },
    };
    const throwingFont = {
      get size(): number {
        trapsHit += 1;
        throw new Error("unreadable size");
      },
    };
    installLibrary(
      () => [
        { name: "First", styles: [{ font: first }] },
        throwingStyles,
        { name: "Mid", styles: [{ font: throwingFont }] },
        null,
        { name: "Last", styles: [{ font: last }] },
      ],
      () => [],
    );
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(trapsHit).toBeGreaterThan(0);
    expect([6, 6 * K]).toContain(first.size);
    expect([8, 8 * K]).toContain(last.size);
    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
  });

  it("preview rejecting keeps today's fallback and corrects nothing", async () => {
    const font = { size: 6 };
    installLibrary(() => workbook().datas, sizesOf);
    lib.init.mockImplementationOnce(() => {
      const xs = { datas: [] as unknown[], sheet: { reload: () => {}, resetData: () => {} } };
      drawings.push({ xs } as unknown as Drawing);
      return {
        xs,
        preview: async () => {
          xs.datas = [{ name: "S", styles: [{ font }] }];
          throw new Error("corrupt workbook");
        },
        destroy: vi.fn(),
      };
    });
    const { rerender } = render(<FilePreview file={XLSX()} />);

    expect(await screen.findByRole("heading", { name: FALLBACK_HEADING })).toBeInTheDocument();
    await settle();
    expect(font.size).toBe(6);
    await nextWorkbookIsCorrected(rerender);
  });
});
