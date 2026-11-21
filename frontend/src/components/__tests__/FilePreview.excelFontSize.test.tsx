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

type Sheets = unknown;
type Sizes = unknown[];
type Options = Record<string, unknown> & { transformData?: unknown };

/**
 * A library instance shaped like @js-preview/excel's: `preview` converts the
 * workbook, hands the sheets to `options.transformData` when it is a function,
 * and gives what it returns to the grid (`xs.loadData`). A throw out of
 * `transformData` rejects `preview`, as the library's own does.
 */
interface Drawing {
  options: Options;
  xs: {
    datas: Sheets;
    loadData: (d: Sheets) => void;
    sheet: { data: unknown; reload: () => void; resetData: (d: unknown) => void };
  };
  destroy: ReturnType<typeof vi.fn>;
  /** The sheets the library handed to `transformData`. */
  passed: Sheets[];
  /** What the grid received from `loadData`, by reference. */
  loaded: Sheets[];
  /** Font sizes copied at the moment the grid received the sheets: its first render. */
  firstRender: Sizes | undefined;
  /** Font sizes copied at every reload made after `preview` resolved. */
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

interface LibraryBehaviour {
  /** false: a build that never calls `transformData`. */
  callsTransform?: boolean;
}

/** Installs a library whose `preview` converts the n-th drawing's workbook to `load(n)`. */
function installLibrary(load: (index: number) => Sheets, behaviour: LibraryBehaviour = {}) {
  const callsTransform = behaviour.callsTransform ?? true;
  lib.init.mockImplementation((container: HTMLElement, options: Options = {}) => {
    let previewed = false;
    const drawing: Drawing = {
      options,
      xs: {
        datas: [],
        loadData: (d: Sheets) => {
          drawing.loaded.push(d);
          drawing.xs.datas = d;
          if (Array.isArray(d)) drawing.xs.sheet.data = d[0];
          drawing.firstRender = sizesOf(d);
        },
        sheet: {
          data: undefined,
          reload: () => {
            if (previewed) drawing.reloadsAfterPreview.push(sizesOf(drawing.xs.datas));
          },
          resetData: (d: unknown) => {
            drawing.xs.sheet.data = d;
          },
        },
      },
      destroy: vi.fn(),
      passed: [],
      loaded: [],
      firstRender: undefined,
      reloadsAfterPreview: [],
    };
    const index = drawings.length;
    drawings.push(drawing);
    return {
      xs: drawing.xs,
      preview: async (data: unknown) => {
        const id = await idOfBody(data);
        let sheets = load(index);
        const transform = options?.transformData;
        if (callsTransform && typeof transform === "function") {
          drawing.passed.push(sheets);
          sheets = transform(sheets);
        }
        drawing.xs.loadData(sheets);
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
 * The drawn size of each stored size, in whole CSS px, from the spec's table.
 * The corrected value is the whole pixel plus 0.01.
 */
const DRAWN_PX: [number, number][] = [
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 11],
  [9, 12],
  [10, 13],
  [11, 15],
  [12, 16],
  [14, 19],
  [21, 28],
  [27, 36],
];
const corrected = (stored: number) => {
  const row = DRAWN_PX.find(([s]) => s === stored);
  if (!row) throw new Error(`no drawn size for stored ${stored}`);
  return row[1] + 0.01;
};

/**
 * Three sheets the way the library loads them: fonts with and without a numeric
 * size, one font object shared by two styles on one sheet and by a third on
 * another, styles without a font, and row heights and column widths. `size` maps
 * each numeric size, so `workbook(corrected)` is the expected result of
 * correcting `workbook()`.
 */
function workbook(size: (n: number) => number = (n) => n) {
  const shared = { name: "MS Gothic", size: size(6) };
  const twin = { name: "MS Gothic", size: size(6) };
  const small = { name: "Calibri", size: size(5), bold: true };
  const body = { name: "Calibri", size: size(11), italic: true, color: "#ff0000" };
  const second = { name: "Arial", size: size(8), underline: true };
  const large = { name: "Arial", size: size(21) };
  const unsized = { name: "Arial", bold: true };
  const textSized = { name: "Arial", size: "10" };
  const nullSized = { name: "Arial", size: null };
  const sheets = [
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
      media: [],
    },
    {
      name: "Sheet2",
      styles: [{ font: shared }, { font: second, valign: "top" }, { font: twin }, { font: large }],
      rows: { len: 1, 0: { height: 15, cells: { 0: { text: "d", style: 1 } } } },
      cols: { len: 1, 0: { width: 80 } },
      merges: [],
      media: [],
    },
    { name: "Sheet3", styles: [], rows: { len: 0 }, cols: { len: 0 }, merges: [], media: [] },
  ];
  return { sheets, fonts: { shared, twin, small, body, second, large, unsized, textSized, nullSized } };
}

/** The `size` of every style's font, sheet by sheet, copied. A getter that throws reads as "!". */
function sizesOf(sheets: Sheets): Sizes {
  if (!Array.isArray(sheets)) return [];
  const read = <T,>(get: () => T): T | "!" => {
    try {
      return get();
    } catch {
      return "!";
    }
  };
  return sheets.flatMap((sheet: { styles?: unknown }) => {
    const styles = read(() => sheet?.styles);
    if (!Array.isArray(styles)) return [];
    return styles.map((s: { font?: { size?: unknown } } | null) =>
      read(() =>
        s && typeof s === "object" && s.font && typeof s.font === "object" ? s.font.size : "-",
      ),
    );
  });
}

const CORRECTED_SIZES = sizesOf(workbook(corrected).sheets);

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

function expectShownWithoutFallback(drawing: Drawing, id = "sheet-a") {
  expect(screen.getByText(`drawn:${id} sheet tabs`)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: FALLBACK_HEADING })).not.toBeInTheDocument();
  expect(drawing.destroy).not.toHaveBeenCalled();
}

/** The `transformData` the adapter passed to the drawing's `init`. */
function transformOf(drawing: Drawing): (sheets: Sheets) => Sheets {
  expect(typeof drawing.options?.transformData).toBe("function");
  return drawing.options.transformData as (sheets: Sheets) => Sheets;
}

/** Draws one readable workbook and returns its `transformData`, for direct calls. */
async function adapterTransform() {
  installLibrary(() => workbook().sheets);
  render(<FilePreview file={XLSX()} />);
  await shown();
  return transformOf(drawings[0]);
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

describe("SPEC-CORE-167 I1 I3 each font size the library passes to transformData is corrected to the whole drawn pixel plus 0.01", () => {
  it("passes transformData next to showContextmenu: false in the options of init", async () => {
    installLibrary(() => workbook().sheets);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(lib.init).toHaveBeenCalledTimes(1);
    expect(drawings[0].options.showContextmenu).toBe(false);
    transformOf(drawings[0]);
  });

  it.each(DRAWN_PX)("stored %s is corrected to %s + 0.01", async (stored, px) => {
    const font = { name: "Calibri", size: stored };
    installLibrary(() => [{ name: "Only", styles: [{ font }], rows: { len: 0 }, cols: { len: 0 } }]);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(font.size).toBe(px + 0.01);
    expect(sizesOf(drawings[0].loaded[0])).toEqual([px + 0.01]);
  });

  it("corrects every sheet's fonts once, a shared font included, and leaves everything else as loaded", async () => {
    let loaded!: ReturnType<typeof workbook>;
    installLibrary(() => {
      loaded = workbook();
      return loaded.sheets;
    });
    render(<FilePreview file={XLSX()} />);
    await shown();

    const drawing = drawings[0];
    expect(drawing.loaded).toHaveLength(1);
    expect(drawing.loaded[0]).toBe(drawing.passed[0]);
    expect(drawing.loaded[0]).toEqual(workbook(corrected).sheets);
    expect(loaded.fonts.shared.size).toBe(8 + 0.01);
    expect(loaded.fonts.twin.size).toBe(8 + 0.01);
    expect(loaded.fonts.small.size).toBe(7 + 0.01);
    expect(loaded.fonts.body.size).toBe(15 + 0.01);
    expect(loaded.fonts.second.size).toBe(11 + 0.01);
    expect(loaded.fonts.large.size).toBe(28 + 0.01);
    expect(loaded.fonts.textSized.size).toBe("10");
    expect(loaded.fonts.nullSized.size).toBeNull();
    expect("size" in loaded.fonts.unsized).toBe(false);
  });

  it("returns the very list it was given, for an empty list, a sheet with no styles and one sheet with one style", async () => {
    const transform = await adapterTransform();

    const empty: unknown[] = [];
    expect(transform(empty)).toBe(empty);
    expect(empty).toEqual([]);

    const noStyles = [{ name: "Empty", styles: [], rows: { len: 0 }, cols: { len: 0 } }];
    expect(transform(noStyles)).toBe(noStyles);
    expect(noStyles).toEqual([{ name: "Empty", styles: [], rows: { len: 0 }, cols: { len: 0 } }]);

    const font = { size: 9 };
    const one = [{ name: "Only", styles: [{ font }] }];
    expect(transform(one)).toBe(one);
    expect(font.size).toBe(12 + 0.01);
    expectNoConsole();
  });
});

describe("SPEC-CORE-167 I4 the grid's first render after preview uses the corrected sizes", () => {
  it("the sizes the grid holds when it receives the sheets, and at the first reload, are corrected", async () => {
    installLibrary(() => workbook().sheets);
    render(<FilePreview file={XLSX()} />);
    await shown();

    const drawing = drawings[0];
    expect(drawing.firstRender).toEqual(CORRECTED_SIZES);
    const reloads = drawing.reloadsAfterPreview;
    expect(reloads.length).toBeGreaterThanOrEqual(1);
    expect(reloads[0]).toEqual(CORRECTED_SIZES);
  });
});

describe("SPEC-CORE-167 I2 each size is corrected at most once per drawing", () => {
  it("leaves the corrected sizes alone through reloads, frame resizes, window resizes, re-renders and a sheet switch", async () => {
    installLibrary(() => workbook().sheets);
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
      const sheets = drawing.xs.datas as unknown[];
      drawing.xs.sheet.resetData(sheets[1]);
      drawing.xs.sheet.reload();
      drawing.xs.sheet.resetData(sheets[0]);
      drawing.xs.sheet.reload();
    });
    await waitFor(() =>
      expect(drawing.reloadsAfterPreview.length).toBeGreaterThanOrEqual(reloadsBefore + 4),
    );
    await settle();

    expect(drawing.passed).toHaveLength(1);
    expect(sizesOf(drawing.xs.datas)).toEqual(CORRECTED_SIZES);
    for (const seen of drawing.reloadsAfterPreview) expect(seen).toEqual(CORRECTED_SIZES);
    expect(lib.init).toHaveBeenCalledTimes(1);
  });

  it("a new identity gets its own library instance and its own single correction", async () => {
    installLibrary(() => workbook().sheets);
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
    await shown("sheet-b");

    expect(drawings).toHaveLength(2);
    expect(drawings[1].passed).toHaveLength(1);
    expect(drawings[1].firstRender).toEqual(CORRECTED_SIZES);
    expect(sizesOf(drawings[0].xs.datas)).toEqual(CORRECTED_SIZES);
  });
});

describe("SPEC-CORE-167 I5 a workbook the correction cannot read is still shown", () => {
  /** The same page with a readable workbook: the guard assertions are not a correction that never runs. */
  async function nextWorkbookIsCorrected(rerender: (ui: React.ReactElement) => void) {
    rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
    await shown("sheet-b");
    expect(drawings.at(-1)!.firstRender).toEqual(CORRECTED_SIZES);
  }

  it("skips sheets and styles of unexpected shape and corrects the rest", async () => {
    const good = { size: 9 };
    const alsoGood = { size: 14 };
    const textSized = { size: "8" };
    const nullSized = { size: null };
    const undefinedSized = { size: undefined };
    const unsized = { name: "Arial" };
    installLibrary(() => [
      null,
      7,
      "sheet",
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
          { font: "Arial" },
          { font: textSized },
          { font: nullSized },
          { font: undefinedSized },
          { font: unsized },
          { font: good },
        ],
      },
      { name: "Last", styles: [{ font: alsoGood }] },
    ]);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expect(good.size).toBe(12 + 0.01);
    expect(alsoGood.size).toBe(19 + 0.01);
    expect(textSized.size).toBe("8");
    expect(nullSized.size).toBeNull();
    expect(undefinedSized.size).toBeUndefined();
    expect("size" in unsized).toBe(false);
    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
  });

  const notArrays: [string, () => Sheets][] = [
    ["undefined", () => undefined],
    ["null", () => null],
    ["a string", () => "sheets"],
    ["an array-like object", () => ({ length: 1, 0: { name: "S", styles: [{ font: { size: 6 } }] } })],
  ];
  it.each(notArrays)(
    "the library passes %s: returned unchanged, and the workbook is shown with no fallback, dispose or log",
    async (_, odd) => {
      let passedOdd: Sheets;
      installLibrary((i) => {
        if (i !== 0) return workbook().sheets;
        passedOdd = odd();
        return passedOdd;
      });
      const { rerender } = render(<FilePreview file={XLSX()} />);
      await shown();

      const drawing = drawings[0];
      transformOf(drawing);
      expect(drawing.loaded).toHaveLength(1);
      expect(drawing.loaded[0]).toBe(passedOdd);
      if (passedOdd && typeof passedOdd === "object") {
        const arrayLike = passedOdd as { 0: { styles: { font: { size: number } }[] } };
        expect(arrayLike[0].styles[0].font.size).toBe(6);
      }
      expectShownWithoutFallback(drawing);
      expectNoConsole();
      await nextWorkbookIsCorrected(rerender);
    },
  );

  it("a correction that throws partway returns the list it was given, each size loaded or corrected once, and the workbook shown", async () => {
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
    const throwingStyle = {
      get font(): unknown {
        trapsHit += 1;
        throw new Error("unreadable font");
      },
    };
    let given: Sheets;
    installLibrary((i) => {
      if (i !== 0) return workbook().sheets;
      given = [
        { name: "First", styles: [{ font: first }] },
        throwingStyles,
        { name: "Mid", styles: [{ font: throwingFont }, throwingStyle] },
        { name: "Last", styles: [{ font: last }] },
      ];
      return given;
    });
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    const drawing = drawings[0];
    transformOf(drawing);
    expect(trapsHit).toBeGreaterThan(0);
    expect(drawing.loaded[0]).toBe(given);
    expect([6, 8 + 0.01]).toContain(first.size);
    expect([8, 11 + 0.01]).toContain(last.size);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
    await nextWorkbookIsCorrected(rerender);
  });

  it("a build that never calls transformData shows the workbook as the library draws it, and nothing else corrects a size", async () => {
    const font = { size: 6 };
    installLibrary(() => [{ name: "S", styles: [{ font }] }], { callsTransform: false });
    render(<FilePreview file={XLSX()} />);
    await shown();

    const drawing = drawings[0];
    transformOf(drawing);
    act(() => {
      drawing.xs.sheet.reload();
      window.dispatchEvent(new Event("resize"));
    });
    await settle();

    expect(font.size).toBe(6);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("preview rejecting for its own reasons keeps today's fallback and corrects nothing", async () => {
    const font = { size: 6 };
    installLibrary(() => workbook().sheets);
    lib.init.mockImplementationOnce((_container: HTMLElement, options: Options = {}) => {
      const xs = {
        datas: [] as unknown[],
        loadData: () => {},
        sheet: { reload: () => {}, resetData: () => {} },
      };
      drawings.push({ xs, options } as unknown as Drawing);
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
