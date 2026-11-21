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

// ---------------------------------------------------------------------------
// Sheets in the grid's shape: rows keyed by 0-based row, cells keyed by 0-based
// column, cols with len, merges as A1 range strings, styles by index.
// ---------------------------------------------------------------------------

type Style = Record<string, unknown>;
interface Cell {
  text?: unknown;
  style?: number;
  merge?: [number, number];
}
interface Row {
  height?: unknown;
  hidden?: boolean;
  cells: Record<number, Cell>;
}
interface Sheet {
  name: string;
  styles: Style[];
  rows: Record<number, Row> & { len: number };
  cols: Record<number, { width?: unknown; hidden?: boolean }> & { len: number };
  merges: unknown[];
  media?: unknown[];
}

interface SheetSpec {
  name?: string;
  styles?: Style[];
  /** 0-based row → 0-based column → cell. */
  rows?: Record<number, Record<number, Cell> | Row>;
  cols?: Record<number, { width?: unknown; hidden?: boolean }>;
  colsLen?: number;
  merges?: unknown[];
}

function sheet(spec: SheetSpec): Sheet {
  const rows = { len: 0 } as Sheet["rows"];
  for (const [k, r] of Object.entries(spec.rows ?? {})) {
    const n = Number(k);
    const row: Row = "cells" in r && typeof r.cells === "object" ? (r as Row) : { height: 25, cells: r as Record<number, Cell> };
    rows[n] = row;
    rows.len = Math.max(rows.len, n + 1);
  }
  const cols = { len: spec.colsLen ?? 20 } as Sheet["cols"];
  for (const [k, c] of Object.entries(spec.cols ?? {})) cols[Number(k)] = c;
  return {
    name: spec.name ?? "S",
    styles: spec.styles ?? [],
    rows,
    cols,
    merges: spec.merges ?? [],
    media: [],
  };
}

const clone = <T,>(v: T): T => structuredClone(v);

const cellAt = (s: Sheet, r: number, c: number) => s.rows[r]?.cells[c];
const mergeOf = (s: Sheet, r: number, c: number) => cellAt(s, r, c)?.merge;

/** A text of n characters. */
const chars = (n: number, ch = "x") => ch.repeat(n);

// ---------------------------------------------------------------------------
// The canvas: a 2D context whose measureText is `perChar` px per character.
// ---------------------------------------------------------------------------

interface Measured {
  font: string;
  text: string;
  /** Where the context's canvas was when this text was measured. */
  parent: Element | null;
  connected: boolean;
  display: string;
}

interface Canvas {
  perChar: number;
  measured: Measured[];
  contexts: number;
  canvasesMade: number;
  mode: "context" | "null" | "throws";
  measureThrows: boolean;
  /** Every canvas element made through document.createElement. */
  elements: HTMLCanvasElement[];
}

let canvas: Canvas;

function installCanvas() {
  canvas = { perChar: 10, measured: [], contexts: 0, canvasesMade: 0, mode: "context", measureThrows: false, elements: [] };
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, opts?: ElementCreationOptions) => {
    const el = realCreate(tag, opts);
    if (String(tag).toLowerCase() === "canvas") {
      canvas.canvasesMade += 1;
      canvas.elements.push(el as HTMLCanvasElement);
    }
    return el;
  }) as typeof document.createElement);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((function (this: HTMLCanvasElement, kind: string) {
    const parentOf = () => this.parentElement;
    const connected = () => this.isConnected;
    const display = () => this.style.display;
    if (kind !== "2d") return null;
    canvas.contexts += 1;
    if (canvas.mode === "throws") throw new Error("no canvas");
    if (canvas.mode === "null") return null;
    let font = "10px sans-serif";
    return {
      get font() {
        return font;
      },
      set font(v: string) {
        font = v;
      },
      measureText(text: string) {
        canvas.measured.push({
          font,
          text,
          parent: parentOf(),
          connected: connected(),
          display: display(),
        });
        if (canvas.measureThrows) throw new Error("measure failed");
        return { width: [...text].length * canvas.perChar };
      },
    };
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext);
}

const measuredTexts = () => canvas.measured.map((m) => m.text);

// ---------------------------------------------------------------------------
// The library: preview hands the sheets to transformData only, then to the grid.
// ---------------------------------------------------------------------------

type Options = Record<string, unknown> & { transformData?: unknown };
type Fn = (x: unknown) => unknown;

interface Drawing {
  options: Options;
  /** The element the library was given to draw in. */
  container: HTMLElement;
  /** Canvas elements inside the document right after transformData returned. */
  canvasesAfterTransform: number[];
  xs: {
    datas: unknown;
    loadData: (d: unknown) => void;
    sheet: { data: unknown; reload: () => void; resetData: (d: unknown) => void };
  };
  destroy: ReturnType<typeof vi.fn>;
  passed: unknown[];
  loaded: unknown[];
  reloadsAfterPreview: unknown[];
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

function installLibrary(load: (index: number) => unknown) {
  lib.init.mockImplementation((container: HTMLElement, options: Options = {}) => {
    let previewed = false;
    const index = drawings.length;
    const drawing: Drawing = {
      options,
      container,
      canvasesAfterTransform: [],
      xs: {
        datas: [],
        loadData: (d: unknown) => {
          drawing.loaded.push(d);
          drawing.xs.datas = d;
          if (Array.isArray(d)) drawing.xs.sheet.data = d[0];
        },
        sheet: {
          data: undefined,
          reload: () => {
            if (previewed) drawing.reloadsAfterPreview.push(clone(drawing.xs.datas));
          },
          resetData: (d: unknown) => {
            drawing.xs.sheet.data = d;
          },
        },
      },
      destroy: vi.fn(),
      passed: [],
      loaded: [],
      reloadsAfterPreview: [],
    };
    drawings.push(drawing);
    return {
      xs: drawing.xs,
      preview: async (data: unknown) => {
        const id = await idOfBody(data);
        let sheets = load(index);
        const transform = options?.transformData;
        if (typeof transform === "function") {
          drawing.passed.push(sheets);
          sheets = transform(sheets);
          drawing.canvasesAfterTransform.push(document.querySelectorAll("canvas").length);
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

function transformOf(drawing: Drawing): Fn {
  expect(typeof drawing.options?.transformData).toBe("function");
  return drawing.options.transformData as Fn;
}

/** Draws the given sheets through FilePreview and returns them as the grid received them. */
async function draw(sheets: unknown) {
  installLibrary(() => sheets);
  render(<FilePreview file={XLSX()} />);
  await shown();
  const drawing = drawings[0];
  return { drawing, grid: drawing.loaded[0] as Sheet[] };
}

/** Draws one sheet and returns it as the grid received it. */
async function drawOne(spec: SheetSpec) {
  const { grid, drawing } = await draw([sheet(spec)]);
  return { s: grid[0], drawing };
}

/** The adapter's transformData, for direct calls. */
async function adapterTransform() {
  const { drawing } = await draw([sheet({ rows: { 0: { 0: { text: "a" } } } })]);
  canvas.measured = [];
  canvas.contexts = 0;
  canvas.canvasesMade = 0;
  return transformOf(drawing);
}

/** A row-0 run-on that the step must always produce: 12 chars, 126 px, over 80 px columns → [0, 1]. */
const CONTROL_TEXT = chars(12, "c");
function expectControlRanOn(s: Sheet, row = 0, col = 0) {
  expect(mergeOf(s, row, col), "control cell runs on").toEqual([0, 1]);
  expect(s.merges).toContain(`${colName(col)}${row + 1}:${colName(col + 1)}${row + 1}`);
}

function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Ranges the step added: everything after the loaded entries. */
function added(s: Sheet, loaded: unknown[]) {
  expect(s.merges.slice(0, loaded.length), "loaded ranges stay first and unchanged").toEqual(loaded);
  return s.merges.slice(loaded.length);
}

beforeEach(() => {
  drawings = [];
  observers = [];
  vi.stubGlobal("ResizeObserver", FiringResizeObserver);
  installNetwork();
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  installCanvas();
  lib.init.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("SPEC-CORE-170 §1 normal flow: a left-aligned text wider than its cell runs on over empty cells to its right", () => {
  it("a title in A1 becomes a merge over the empty cells it needs, appended to merges", async () => {
    const { s, drawing } = await drawOne({
      rows: { 0: { 0: { text: chars(20) } } },
      merges: ["D5:E6"],
    });

    // 6 + 200 = 206 px over 80 px columns: A+B = 160, A+B+C = 240.
    expect(mergeOf(s, 0, 0)).toEqual([0, 2]);
    expect(added(s, ["D5:E6"])).toEqual(["A1:C1"]);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("the cells taken are neither changed nor created", async () => {
    const before = sheet({
      styles: [{ align: "center" }],
      rows: { 0: { 0: { text: chars(20) }, 1: { text: "", style: 0 } } },
    });
    const expected = clone(before);
    const { grid } = await draw([before]);
    const s = grid[0];

    expect(mergeOf(s, 0, 0)).toEqual([0, 2]);
    expect(s.rows[0].cells[1]).toEqual(expected.rows[0].cells[1]);
    expect(Object.keys(s.rows[0].cells).sort()).toEqual(["0", "1"]);
    expect(Object.keys(s.rows).sort()).toEqual(Object.keys(expected.rows).sort());
  });

  it("a range in row 3 is written with its 1-based row", async () => {
    const { s } = await drawOne({ rows: { 2: { 0: { text: CONTROL_TEXT } } } });

    expect(mergeOf(s, 2, 0)).toEqual([0, 1]);
    expect(s.merges).toEqual(["A3:B3"]);
  });

  it("a range crossing Z is written with AA (and AB past it)", async () => {
    const { s } = await drawOne({
      colsLen: 30,
      rows: { 0: { 25: { text: chars(20) } }, 1: { 26: { text: CONTROL_TEXT } } },
    });

    expect(mergeOf(s, 0, 25)).toEqual([0, 2]);
    expect(mergeOf(s, 1, 26)).toEqual([0, 1]);
    expect(added(s, []).sort()).toEqual(["AA2:AB2", "Z1:AB1"]);
  });

  it("every sheet of the workbook gets its run-on", async () => {
    const { grid } = await draw([
      sheet({ name: "One", rows: { 0: { 0: { text: CONTROL_TEXT } } } }),
      sheet({ name: "Two", rows: { 4: { 3: { text: CONTROL_TEXT } } } }),
    ]);

    expectControlRanOn(grid[0]);
    expectControlRanOn(grid[1], 4, 3);
  });
});

describe("SPEC-CORE-170 I1 n is the fewest cells to the right whose widths with the cell's own reach 5 + width + 1", () => {
  // perChar 10 at the default 13 px: a text of k characters needs 6 + 10k px.
  const cases: [string, number, Record<number, { width?: unknown }>, number | undefined][] = [
    ["needs exactly its own width (106 px in a 106 px column): nothing", 10, { 0: { width: 106 } }, undefined],
    ["needs one px more than its own width: takes one", 10, { 0: { width: 105 } }, 1],
    ["needs exactly two columns: takes one", 10, { 0: { width: 50 }, 1: { width: 56 } }, 1],
    ["needs one px more than two columns: takes two", 10, { 0: { width: 50 }, 1: { width: 55 } }, 2],
    ["a column with no entry is 80 px: 7 chars (76 px) fit", 7, {}, undefined],
    ["a column with no entry is 80 px: 8 chars (86 px) take one", 8, {}, 1],
    ["a width that is not a number counts as 80: 8 chars take one", 8, { 0: { width: "300" } }, 1],
    ["an entry without width counts as 80 for the taken cell", 17, { 1: {} }, 2],
    ["neighbours' own widths add up: 30 chars (306 px) over 100 + 100 + 100 + 10", 30, { 0: { width: 100 }, 1: { width: 100 }, 2: { width: 100 }, 3: { width: 10 } }, 3],
  ];

  it.each(cases)("%s", async (_, n, cols, expected) => {
    const { s } = await drawOne({
      cols,
      rows: { 0: { 0: { text: chars(n) } }, 1: { 10: { text: CONTROL_TEXT } } },
    });

    expectControlRanOn(s, 1, 10);
    expect(mergeOf(s, 0, 0)).toEqual(expected === undefined ? undefined : [0, expected]);
    const ranges = added(s, []);
    if (expected === undefined) expect(ranges).toEqual(["K2:L2"]);
    else expect(ranges.sort()).toEqual([`A1:${colName(expected)}1`, "K2:L2"].sort());
  });

  it("a hidden column is passed over like any other cell", async () => {
    // 15 chars need 156 px: A 80 + B (hidden) + C 80 = 160.1 or 160.
    const { s } = await drawOne({
      cols: { 1: { width: 0.1, hidden: true } },
      rows: { 0: { 0: { text: chars(15) } } },
    });

    expect(mergeOf(s, 0, 0)).toEqual([0, 2]);
    expect(s.merges).toEqual(["A1:C1"]);
  });

  it("the width of a multi-line text is that of its widest line", async () => {
    const { grid } = await draw([
      sheet({ rows: { 0: { 0: { text: `${chars(10)}\n${chars(12)}` } } } }),
      sheet({ rows: { 0: { 0: { text: `${chars(16)}\n${chars(4)}` } } } }),
      sheet({ rows: { 0: { 0: { text: `${chars(4)}\n${chars(16)}` } } } }),
    ]);

    expect(mergeOf(grid[0], 0, 0)).toEqual([0, 1]);
    expect(mergeOf(grid[1], 0, 0)).toEqual([0, 2]);
    expect(mergeOf(grid[2], 0, 0)).toEqual([0, 2]);
  });

  it("text runs on as far as the sheet allows when it never reaches its width", async () => {
    const { s } = await drawOne({
      colsLen: 3,
      rows: { 0: { 0: { text: chars(100) } } },
    });

    expect(mergeOf(s, 0, 0)).toEqual([0, 2]);
    expect(s.merges).toEqual(["A1:C1"]);
  });
});

describe("SPEC-CORE-170 §1.3 the text is measured in the font the grid draws it in", () => {
  it("[italic ][bold ]<px>px <name>, px the size + 0.01 truncated, 13 px Arial by default", async () => {
    const { s } = await drawOne({
      styles: [
        { font: { name: "Meiryo", size: 15.6, bold: true, italic: true } },
        { font: { size: 20, bold: true } },
        { font: { name: "Yu Gothic", italic: true } },
        { align: "left" },
      ],
      rows: {
        0: { 0: { text: chars(30, "a"), style: 0 } },
        1: { 0: { text: chars(30, "b"), style: 1 } },
        2: { 0: { text: chars(30, "c"), style: 2 } },
        3: { 0: { text: chars(30, "d"), style: 3 } },
        4: { 0: { text: chars(30, "e") } },
        5: { 0: { text: chars(30, "f"), style: 9 } },
      },
    });

    const fontOf = (text: string) => canvas.measured.filter((m) => m.text === text).map((m) => m.font);
    expect(fontOf(chars(30, "a"))).toEqual(["italic bold 15px Meiryo"]);
    expect(fontOf(chars(30, "b"))).toEqual(["bold 20px Arial"]);
    expect(fontOf(chars(30, "c"))).toEqual(["italic 13px Yu Gothic"]);
    expect(fontOf(chars(30, "d"))).toEqual(["13px Arial"]);
    expect(fontOf(chars(30, "e"))).toEqual(["13px Arial"]);
    expect(fontOf(chars(30, "f"))).toEqual(["13px Arial"]);
    expect(mergeOf(s, 5, 0)).toEqual([0, 3]);
  });

  it("one canvas is made per transformData call, and each candidate is measured at most once", async () => {
    const { s } = await drawOne({
      rows: {
        0: { 0: { text: CONTROL_TEXT } },
        1: { 0: { text: chars(14, "p") } },
        2: { 0: { text: chars(16, "q") } },
      },
    });

    expectControlRanOn(s);
    expect(canvas.canvasesMade).toBe(1);
    expect(measuredTexts().sort()).toEqual([CONTROL_TEXT, chars(14, "p"), chars(16, "q")].sort());
  });

  it("a text whose every line fits at 2 em per character is not measured; one that might not is", async () => {
    const { s } = await drawOne({
      styles: [{ font: { size: 9 } }],
      rows: {
        0: { 0: { text: CONTROL_TEXT } },
        1: { 0: { text: "ab" } },
        2: { 0: { text: "abc" } },
        3: { 0: { text: "wxyz", style: 0 } },
        4: { 0: { text: "vwxyz", style: 0 } },
        5: { 0: { text: "ab\ncd" } },
      },
    });

    expectControlRanOn(s);
    const texts = measuredTexts();
    expect(texts).not.toContain("ab");
    expect(texts).not.toContain("wxyz");
    expect(texts.some((t) => t.includes("ab\ncd") || t === "cd")).toBe(false);
    expect(texts).toContain("abc");
    expect(texts).toContain("vwxyz");
    expect(mergeOf(s, 2, 0)).toBeUndefined();
    expect(mergeOf(s, 4, 0)).toBeUndefined();
  });

  it("a workbook with nothing to measure makes no canvas", async () => {
    const { s } = await drawOne({ rows: { 0: { 0: { text: "ab" } } } });

    expect(s.merges).toEqual([]);
    expect(canvas.canvasesMade).toBe(0);
    expect(canvas.contexts).toBe(0);
    const transform = transformOf(drawings[0]);
    const again = [sheet({ rows: { 0: { 0: { text: CONTROL_TEXT } } } })];
    transform(again);
    expectControlRanOn(again[0]);
    expect(canvas.canvasesMade).toBe(1);
  });
});

describe("SPEC-CORE-170 I2 a cell that is not a candidate keeps its merge and adds nothing", () => {
  const notCandidates: [string, SheetSpec][] = [
    ["a formula text", { rows: { 0: { 0: { text: `=${chars(30)}` } } } }],
    ["a number", { rows: { 0: { 0: { text: 12345678901234567890 } } } }],
    ["a row of height 0.99", { rows: { 0: { height: 0.99, cells: { 0: { text: chars(30) } } } } }],
    ["a hidden row", { rows: { 0: { height: 25, hidden: true, cells: { 0: { text: chars(30) } } } } }],
    ["a hidden column", { cols: { 0: { width: 0.1, hidden: true } }, rows: { 0: { 0: { text: chars(30) } } } }],
    ["a column of width 0.5", { cols: { 0: { width: 0.5 } }, rows: { 0: { 0: { text: chars(30) } } } }],
    ["inside a loaded range", { merges: ["A1:A2"], rows: { 0: { 0: { text: "" } }, 1: { 0: { text: chars(30) } } } }],
    ["wrapped", { styles: [{ textwrap: true }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["centred", { styles: [{ align: "center" }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["right-aligned", { styles: [{ align: "right" }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a top border", { styles: [{ border: { top: ["thin", "#000"] } }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a right border", { styles: [{ border: { right: ["thin", "#000"] } }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a bottom border", { styles: [{ border: { bottom: ["thin", "#000"] } }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a left border", { styles: [{ border: { left: ["thin", "#000"] } }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a fill", { styles: [{ bgcolor: "#ffff00" }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
    ["a font size that is a string", { styles: [{ font: { size: "10" } }], rows: { 0: { 0: { text: chars(30), style: 0 } } } }],
  ];

  it.each(notCandidates)("%s does not run on", async (_, spec) => {
    const loaded = clone(spec.merges ?? []);
    const s = sheet({
      ...spec,
      rows: { ...spec.rows, 5: { 3: { text: CONTROL_TEXT } } },
    });
    const { grid } = await draw([s]);
    const out = grid[0];

    expect(mergeOf(out, 0, 0)).toBeUndefined();
    expect(mergeOf(out, 1, 0)).toBeUndefined();
    expectControlRanOn(out, 5, 3);
    expect(added(out, loaded)).toEqual(["D6:E6"]);
  });

  it("a cell with a merge of its own keeps it exactly", async () => {
    const { s } = await drawOne({
      merges: ["A1:A2"],
      rows: { 0: { 0: { text: chars(30), merge: [1, 0] } }, 5: { 0: { text: CONTROL_TEXT } } },
    });

    expect(mergeOf(s, 0, 0)).toEqual([1, 0]);
    expect(added(s, ["A1:A2"])).toEqual(["A6:B6"]);
  });

  it("a cell inside a multi-row loaded range that starts left of it and above it", async () => {
    const { s } = await drawOne({
      merges: ["A1:C3"],
      rows: { 2: { 1: { text: chars(30) } }, 5: { 0: { text: CONTROL_TEXT } } },
    });

    expect(mergeOf(s, 2, 1)).toBeUndefined();
    expect(added(s, ["A1:C3"])).toEqual(["A6:B6"]);
  });

  const stillCandidates: [string, Style[], number | undefined][] = [
    ["align left", [{ align: "left" }], 0],
    ["an empty border object", [{ border: {} }], 0],
    ["a border whose four sides are falsy", [{ border: { top: undefined, right: null, bottom: false, left: "" } }], 0],
    ["a style index with no entry", [], 3],
    ["no style at all", [], undefined],
  ];
  it.each(stillCandidates)("a cell with %s does run on", async (_, styles, style) => {
    const { s } = await drawOne({
      styles,
      rows: { 0: { 0: { text: CONTROL_TEXT, ...(style === undefined ? {} : { style }) } } },
    });

    expectControlRanOn(s);
  });
});

describe("SPEC-CORE-170 I1 and I4 the run stops before a cell with text, a merge, a border, a fill, or cols.len", () => {
  // A 30-char text needs 306 px; over 80 px columns it would take three cells (A..D).
  const stops: [string, SheetSpec, number][] = [
    ["text in C", { rows: { 0: { 2: { text: "x" } } } }, 1],
    ["a space in C", { rows: { 0: { 2: { text: " " } } } }, 1],
    ["the number 0 in C", { rows: { 0: { 2: { text: 0 } } } }, 1],
    ["a number in B", { rows: { 0: { 1: { text: 42 } } } }, 0],
    ["a date in C", { rows: { 0: { 2: { text: new Date(2022, 5, 1) } } } }, 1],
    ["a merge on C", { rows: { 0: { 2: { text: "", merge: [0, 1] } } } }, 1],
    ["C inside a loaded range", { merges: ["C1:D1"], rows: {} }, 1],
    ["C inside a loaded range that starts in a row above", { merges: ["C1:D2"], rows: { 1: { 0: { text: chars(30) } } } }, 1],
    ["an empty C with a border", { styles: [{ border: { left: ["thin", "#000"] } }], rows: { 0: { 2: { text: "", style: 0 } } } }, 1],
    ["an empty C with a fill", { styles: [{ bgcolor: "#eee" }], rows: { 0: { 2: { style: 0 } } } }, 1],
    ["cols.len 3", { colsLen: 3, rows: {} }, 2],
  ];

  it.each(stops)("%s", async (name, spec, n) => {
    const row = name.includes("row above") ? 1 : 0;
    const loaded = clone(spec.merges ?? []);
    const rows: SheetSpec["rows"] = { ...spec.rows };
    const own = (rows[row] ?? {}) as Record<number, Cell>;
    rows[row] = { ...own, 0: { text: chars(30) } };
    rows[5] = { 0: { text: CONTROL_TEXT } };
    const { s } = await drawOne({ ...spec, colsLen: spec.colsLen ?? 20, rows });

    expectControlRanOn(s, 5);
    const expectedRange = n === 0 ? [] : [`A${row + 1}:${colName(n)}${row + 1}`];
    expect(mergeOf(s, row, 0)).toEqual(n === 0 ? undefined : [0, n]);
    expect(added(s, loaded).sort()).toEqual([...expectedRange, "A6:B6"].sort());
  });

  it("cols.len 1 is a stop even though the cell would otherwise run on (paired with a wider sheet)", async () => {
    const { grid } = await draw([
      sheet({ colsLen: 1, rows: { 0: { 0: { text: chars(30) } } } }),
      sheet({ colsLen: 20, rows: { 0: { 0: { text: chars(30) } } } }),
    ]);

    expect(mergeOf(grid[0], 0, 0)).toBeUndefined();
    expect(grid[0].merges).toEqual([]);
    expect(mergeOf(grid[1], 0, 0)).toEqual([0, 3]);
  });

  const passes: [string, SheetSpec][] = [
    ["an empty-string text", { rows: { 0: { 1: { text: "" } } } }],
    ["a null text", { rows: { 0: { 1: { text: null } } } }],
    ["a cell with no text", { rows: { 0: { 1: {} } } }],
    ["a centred, wrapped empty cell", { styles: [{ align: "center", textwrap: true }], rows: { 0: { 1: { text: "", style: 0 } } } }],
    ["an empty cell whose border object has no side", { styles: [{ border: {} }], rows: { 0: { 1: { style: 0 } } } }],
  ];
  it.each(passes)("%s is taken", async (_, spec) => {
    const rows: SheetSpec["rows"] = { ...spec.rows };
    rows[0] = { ...((rows[0] ?? {}) as Record<number, Cell>), 0: { text: chars(30) } };
    const { s } = await drawOne({ ...spec, rows });

    expect(mergeOf(s, 0, 0)).toEqual([0, 3]);
    expect(s.merges).toEqual(["A1:D1"]);
  });

  it("two candidates in a row run on left to right without overlapping", async () => {
    const { s } = await drawOne({
      rows: { 0: { 0: { text: chars(20) }, 2: { text: chars(20) } } },
    });

    expect(mergeOf(s, 0, 0)).toEqual([0, 1]);
    expect(mergeOf(s, 0, 2)).toEqual([0, 2]);
    expect(added(s, []).sort()).toEqual(["A1:B1", "C1:E1"]);
  });
});

describe("SPEC-CORE-170 I3 nothing but the run-on merges differs from what the grid would have received", () => {
  it("cells, text, styles, row heights, column widths and loaded merges are as given, plus 0.01 on sizes", async () => {
    const given = sheet({
      styles: [
        { font: { name: "Meiryo", size: 14, bold: true } },
        { border: { top: ["thin", "#000"] } },
        { align: "center", bgcolor: "#ff0" },
      ],
      cols: { 0: { width: 120 }, 2: { width: 0.1, hidden: true }, 5: { width: 64 } },
      merges: ["F2:G3"],
      rows: {
        0: { height: 33, cells: { 0: { text: chars(30), style: 0 }, 4: { text: "x" } } },
        1: { height: 20, cells: { 0: { text: "short" }, 1: { text: "", style: 1 }, 5: { text: "m", merge: [1, 1] } } },
        3: { height: 0.1, hidden: true, cells: {} },
        4: { height: 25, cells: { 0: { text: "centred", style: 2 }, 7: { text: chars(25) } } },
      },
    });
    const expected = clone(given);
    (expected.styles[0].font as { size: number }).size += 0.01;
    expected.rows[0].cells[0].merge = [0, 3];
    expected.rows[4].cells[7].merge = [0, 3];
    expected.merges.push("A1:D1", "H5:K5");

    const { grid } = await draw([given]);
    const s = grid[0];
    const { merges, ...rest } = s;
    const { merges: expectedMerges, ...expectedRest } = expected;

    expect(rest).toEqual(expectedRest);
    expect(merges.slice(0, 1)).toEqual(["F2:G3"]);
    expect([...merges].sort()).toEqual([...expectedMerges].sort());
  });
});

describe("SPEC-CORE-170 I5 the run-on is decided once per drawing", () => {
  it("reloads, frame resizes, window resizes and a sheet switch add or remove no range", async () => {
    installLibrary(() => [
      sheet({ name: "One", rows: { 0: { 0: { text: CONTROL_TEXT } } } }),
      sheet({ name: "Two", rows: { 1: { 1: { text: chars(20) } } } }),
    ]);
    render(<FilePreview file={XLSX()} />);
    await shown();
    const drawing = drawings[0];
    const sheets = drawing.xs.datas as Sheet[];
    expectControlRanOn(sheets[0]);
    expect(sheets[1].merges).toEqual(["B2:D2"]);
    const measuredBefore = canvas.measured.length;
    const reloadsBefore = drawing.reloadsAfterPreview.length;

    act(() => {
      drawing.xs.sheet.reload();
    });
    act(() => {
      for (const o of observers.filter((o) => !o.disconnected)) o.cb([], o as unknown as ResizeObserver);
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      drawing.xs.sheet.resetData(sheets[1]);
      drawing.xs.sheet.reload();
      drawing.xs.sheet.resetData(sheets[0]);
      drawing.xs.sheet.reload();
    });
    await waitFor(() => expect(drawing.reloadsAfterPreview.length).toBeGreaterThanOrEqual(reloadsBefore + 3));
    await settle();

    expect(drawing.passed).toHaveLength(1);
    expect(canvas.measured.length).toBe(measuredBefore);
    expect(sheets[0].merges).toEqual(["A1:B1"]);
    expect(sheets[1].merges).toEqual(["B2:D2"]);
    for (const seen of drawing.reloadsAfterPreview as Sheet[][]) {
      expect(seen[0].merges).toEqual(["A1:B1"]);
      expect(seen[1].merges).toEqual(["B2:D2"]);
    }
  });
});

describe("SPEC-CORE-170 I6 and I7 a missing canvas context, a sheet of unexpected shape, or a throw still shows the workbook", () => {
  const workbook = () => [
    sheet({
      styles: [{ font: { size: 11 } }],
      merges: ["E5:F6"],
      rows: { 0: { 0: { text: chars(20), style: 0 } }, 2: { 1: { text: CONTROL_TEXT } } },
    }),
  ];

  it.each(["null", "throws"] as const)(
    "getContext %s: merges and every merge as loaded, sizes still + 0.01, no fallback or console; a working context runs on",
    async (mode) => {
      canvas.mode = mode;
      installLibrary((i) => {
        if (i === 1) canvas.mode = "context";
        return workbook();
      });
      const { rerender } = render(<FilePreview file={XLSX()} />);
      await shown();
      const first = drawings[0];
      const broken = first.xs.datas as Sheet[];

      expect(broken[0].merges).toEqual(["E5:F6"]);
      expect(mergeOf(broken[0], 0, 0)).toBeUndefined();
      expect(mergeOf(broken[0], 2, 1)).toBeUndefined();
      expect((broken[0].styles[0].font as { size: number }).size).toBeCloseTo(11.01, 9);
      expectShownWithoutFallback(first);
      expectNoConsole();

      rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
      await shown("sheet-b");
      const working = drawings[1].xs.datas as Sheet[];
      expect(mergeOf(working[0], 0, 0)).toEqual([0, 2]);
      expect(added(working[0], ["E5:F6"]).sort()).toEqual(["A1:C1", "B3:C3"]);
      expectNoConsole();
    },
  );

  it("sheets, rows, cells and merges entries of unexpected shape are skipped and the rest run on", async () => {
    const goodLast = sheet({ name: "Last", rows: { 0: { 0: { text: CONTROL_TEXT } } } });
    const noMerges = { ...sheet({ rows: { 0: { 0: { text: chars(30) } } } }), merges: undefined };
    const stylesNotArray = { ...sheet({ rows: { 0: { 0: { text: chars(30) } } } }), styles: "x" };
    const rowsNotObject = { ...sheet({}), rows: "rows" };
    const colsNotObject = { ...sheet({ rows: { 0: { 0: { text: chars(30) } } } }), cols: 7 };
    const oddEntries = sheet({
      merges: [7, null, "nonsense", { a: 1 }, "C2:D2"],
      rows: {
        0: { 0: { text: CONTROL_TEXT } },
        1: { 0: { text: chars(30) } },
      },
    });
    const oddRows = sheet({ rows: { 3: { 0: { text: CONTROL_TEXT } } } });
    (oddRows.rows as unknown as Record<number, unknown>)[0] = null;
    (oddRows.rows as unknown as Record<number, unknown>)[1] = 5;
    (oddRows.rows as unknown as Record<number, unknown>)[2] = { height: 25, cells: "cells" };
    const oddCells = sheet({ rows: { 0: { 2: { text: CONTROL_TEXT } } } });
    (oddCells.rows[0].cells as unknown as Record<number, unknown>)[0] = null;
    (oddCells.rows[0].cells as unknown as Record<number, unknown>)[1] = "cell";

    const given = [null, 7, "sheet", {}, noMerges, stylesNotArray, rowsNotObject, colsNotObject, oddEntries, oddRows, oddCells, goodLast];
    const { drawing, grid } = await draw(given);

    expect(grid).toBe(given);
    expect(noMerges.merges).toBeUndefined();
    expect(mergeOf(noMerges as unknown as Sheet, 0, 0)).toBeUndefined();
    expect(mergeOf(stylesNotArray as unknown as Sheet, 0, 0)).toBeUndefined();
    expect(stylesNotArray.merges).toEqual([]);
    expect(mergeOf(colsNotObject as unknown as Sheet, 0, 0)).toBeUndefined();
    expect(colsNotObject.merges).toEqual([]);

    expect(mergeOf(oddEntries, 0, 0)).toEqual([0, 1]);
    expect(mergeOf(oddEntries, 1, 0)).toEqual([0, 1]);
    expect(oddEntries.merges.slice(0, 5)).toEqual([7, null, "nonsense", { a: 1 }, "C2:D2"]);
    expect(oddEntries.merges.slice(5).sort()).toEqual(["A1:B1", "A2:B2"]);

    expect(mergeOf(oddRows, 3, 0)).toEqual([0, 1]);
    expect(oddRows.merges).toEqual(["A4:B4"]);
    expect(mergeOf(oddCells, 0, 2)).toEqual([0, 1]);
    expect(oddCells.merges).toEqual(["C1:D1"]);
    expectControlRanOn(goodLast);

    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("a step that throws partway returns the list, keeps sizes + 0.01, and every merge set is in merges", async () => {
    const transform = await adapterTransform();
    let trapsHit = 0;
    const first = sheet({ name: "First", styles: [{ font: { size: 9 } }], rows: { 0: { 0: { text: CONTROL_TEXT, style: 0 } } } });
    const trapRow = sheet({
      name: "Trap",
      styles: [{ font: { size: 12 } }],
      rows: { 0: { 0: { text: chars(14, "r") } }, 1: { 0: { text: CONTROL_TEXT } } },
    });
    Object.defineProperty(trapRow.rows[1].cells, 0, {
      enumerable: true,
      get() {
        trapsHit += 1;
        throw new Error("unreadable cell");
      },
    });
    const last = sheet({ name: "Last", styles: [{ font: { size: 10 } }], rows: { 0: { 0: { text: CONTROL_TEXT } } } });
    const given = [first, trapRow, last];

    let out: unknown;
    expect(() => {
      out = transform(given);
    }).not.toThrow();
    expect(out).toBe(given);
    expect(trapsHit).toBeGreaterThan(0);
    expect((first.styles[0].font as { size: number }).size).toBeCloseTo(9.01, 9);
    expect((trapRow.styles[0].font as { size: number }).size).toBeCloseTo(12.01, 9);
    expect((last.styles[0].font as { size: number }).size).toBeCloseTo(10.01, 9);
    expectControlRanOn(first);
    for (const s of [first, last]) {
      const merged = mergeOf(s, 0, 0);
      if (merged) expect(s.merges).toEqual(["A1:B1"]);
      else expect(s.merges).toEqual([]);
    }
    const trapRowZero = trapRow.rows[0].cells[0];
    if (trapRowZero.merge) expect(trapRow.merges).toEqual(["A1:B1"]);
    else expect(trapRow.merges).toEqual([]);
    expectNoConsole();
  });
});

describe("SPEC-CORE-170 §1.3 the measuring canvas is in the element the library draws in, hidden, only while the pass measures", () => {
  function expectMeasuredInside(container: HTMLElement) {
    expect(canvas.measured.length).toBeGreaterThan(0);
    for (const m of canvas.measured) {
      expect(m.parent, `canvas parent while measuring "${m.text}"`).toBe(container);
      expect(m.connected).toBe(true);
      expect(m.display).toBe("none");
    }
  }

  function expectNoCanvasLeft(container: HTMLElement) {
    expect(container.querySelector("canvas")).toBeNull();
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    for (const el of canvas.elements) expect(el.isConnected).toBe(false);
  }

  it("every measurement is made on a hidden canvas appended to the library's element, gone when transformData returns", async () => {
    const { s, drawing } = await drawOne({
      rows: {
        0: { 0: { text: CONTROL_TEXT } },
        1: { 0: { text: chars(14, "p") } },
        2: { 0: { text: chars(16, "q") } },
      },
    });

    expectControlRanOn(s);
    expect(canvas.canvasesMade).toBe(1);
    expect(measuredTexts()).toHaveLength(3);
    expectMeasuredInside(drawing.container);
    expect(drawing.canvasesAfterTransform).toEqual([0]);
    expectNoCanvasLeft(drawing.container);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("a direct transformData call measures inside the same element and removes its canvas", async () => {
    const transform = await adapterTransform();
    const container = drawings[0].container;
    canvas.measured = [];
    canvas.elements = [];
    const again = [sheet({ rows: { 0: { 0: { text: CONTROL_TEXT } }, 3: { 2: { text: chars(20) } } } })];

    transform(again);

    expectControlRanOn(again[0]);
    expectMeasuredInside(container);
    expectNoCanvasLeft(container);
  });

  it("a step that throws after measuring still removes the canvas", async () => {
    const transform = await adapterTransform();
    const container = drawings[0].container;
    canvas.measured = [];
    canvas.elements = [];
    let trapsHit = 0;
    const first = sheet({ name: "First", rows: { 0: { 0: { text: CONTROL_TEXT } } } });
    const trapRow = sheet({ name: "Trap", rows: { 0: { 0: { text: CONTROL_TEXT } } } });
    Object.defineProperty(trapRow.rows, 1, {
      enumerable: true,
      get() {
        trapsHit += 1;
        throw new Error("unreadable row");
      },
    });
    const given = [first, trapRow];

    let out: unknown;
    expect(() => {
      out = transform(given);
    }).not.toThrow();

    expect(out).toBe(given);
    expect(trapsHit).toBeGreaterThan(0);
    expectControlRanOn(first);
    expectMeasuredInside(container);
    expectNoCanvasLeft(container);
    expectNoConsole();
  });

  it("a measurement that throws still removes the canvas and shows the workbook", async () => {
    canvas.measureThrows = true;
    const { s, drawing } = await drawOne({
      styles: [{ font: { size: 11 } }],
      rows: { 0: { 0: { text: CONTROL_TEXT, style: 0 } } },
    });

    expect((s.styles[0].font as { size: number }).size).toBeCloseTo(11.01, 9);
    expectMeasuredInside(drawing.container);
    expect(drawing.canvasesAfterTransform).toEqual([0]);
    expectNoCanvasLeft(drawing.container);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });
});
