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
// A fake ExcelJS workbook. It exposes only the members the scaling may use:
// eachSheet; a worksheet's properties, rowCount, getRow, findRow, getColumn,
// columns and getImages; a row's height, hidden, cellCount and eachCell; a
// cell's value and style; a column's width and hidden; a picture's range. As in
// ExcelJS, `columns` is the worksheet's own `_columns` array (null until a
// column exists) and `getColumn` extends it. The library's conversion reads the
// fake's own state, so it sees what was set, not what a member reports.
// ---------------------------------------------------------------------------

type Font = Record<string, unknown> & { size?: unknown };
interface CellSpec {
  value?: unknown;
  style?: unknown;
}
interface RowSpec {
  height?: unknown;
  hidden?: boolean;
  cells?: Record<number, CellSpec>;
}
interface ColSpec {
  width?: unknown;
  hidden?: boolean;
}
interface Anchor {
  nativeCol?: number;
  nativeColOff?: number;
  nativeRow?: number;
  nativeRowOff?: number;
}
interface ImageRange {
  tl?: Anchor;
  br?: Anchor;
  ext?: { width?: number; height?: number };
}
type Thrower = "rowCount" | "getRow" | "findRow" | "getColumn" | "columns" | "getImages" | "properties";
interface SheetSpec {
  name: string;
  properties?: unknown;
  rows?: Record<number, RowSpec>;
  cols?: Record<number, ColSpec>;
  images?: unknown[];
  merges?: string[];
  oddRows?: Record<number, unknown>;
  oddCols?: Record<number, unknown>;
  throwIn?: Thrower;
}

class Raw {
  constructor(public raw: unknown) {}
}

interface FakeCell {
  value: unknown;
  style: unknown;
}

const rowCells = new WeakMap<object, Map<number, FakeCell>>();

class FakeRow {
  height: unknown;
  hidden: boolean;
  constructor(spec: RowSpec) {
    this.height = spec.height;
    this.hidden = spec.hidden ?? false;
    const cells = new Map<number, FakeCell>();
    for (const [k, c] of Object.entries(spec.cells ?? {})) {
      cells.set(Number(k), { value: c.value ?? null, style: c.style });
    }
    rowCells.set(this, cells);
  }
  get cellCount(): number {
    const cells = rowCells.get(this)!;
    return cells.size ? Math.max(...cells.keys()) : 0;
  }
  /** As ExcelJS: without includeEmpty only cells with a value; with it, missing cells are created. */
  eachCell(a: unknown, b?: unknown) {
    const cb = (typeof a === "function" ? a : b) as (cell: FakeCell, col: number) => void;
    const includeEmpty =
      typeof a === "object" && a !== null && (a as { includeEmpty?: boolean }).includeEmpty;
    const cells = rowCells.get(this)!;
    if (includeEmpty) {
      for (let c = 1; c <= this.cellCount; c++) {
        if (!cells.has(c)) cells.set(c, { value: null, style: {} });
        cb(cells.get(c)!, c);
      }
      return;
    }
    for (const c of [...cells.keys()].sort((x, y) => x - y)) {
      const cell = cells.get(c)!;
      if (cell.value !== null && cell.value !== undefined) cb(cell, c);
    }
  }
}

interface FakeWorksheet {
  name: string;
  _columns: unknown[] | null;
}

interface SheetState {
  spec: SheetSpec;
  rows: Map<number, unknown>;
  images: unknown[];
  /** Row numbers `getRow` created. */
  created: number[];
  worksheet: FakeWorksheet;
  /** `_columns` as loaded, before anything ran. */
  loadedColumns: unknown[] | null;
}

const books = new WeakMap<object, (SheetState | Raw)[]>();

function makeSheet(spec: SheetSpec): SheetState {
  const properties = "properties" in spec ? spec.properties : { defaultRowHeight: 15 };
  const rows = new Map<number, unknown>();
  for (const [k, r] of Object.entries(spec.rows ?? {})) rows.set(Number(k), new FakeRow(r));
  for (const [k, r] of Object.entries(spec.oddRows ?? {})) rows.set(Number(k), r);
  const defined = new Map<number, unknown>();
  for (const [k, c] of Object.entries(spec.cols ?? {})) {
    defined.set(Number(k), { width: c.width, hidden: c.hidden ?? false });
  }
  for (const [k, c] of Object.entries(spec.oddCols ?? {})) defined.set(Number(k), c);
  const blankColumn = () => ({ width: undefined, hidden: false });
  const columns: unknown[] | null = defined.size
    ? range(1, Math.max(...defined.keys())).map((c) => (defined.has(c) ? defined.get(c) : blankColumn()))
    : null;
  const images = spec.images ?? [];
  const created: number[] = [];
  const thrower = (member: Thrower) => {
    if (spec.throwIn === member) throw new Error(`unreadable ${member}`);
  };
  const worksheet = {
    name: spec.name,
    _columns: columns,
    get columns() {
      thrower("columns");
      return this._columns;
    },
    get properties() {
      thrower("properties");
      return properties;
    },
    get rowCount() {
      thrower("rowCount");
      return rows.size ? Math.max(...rows.keys()) : 0;
    },
    getRow(i: number) {
      if (i === 50) thrower("getRow");
      if (!rows.has(i)) {
        rows.set(i, new FakeRow({}));
        created.push(i);
      }
      return rows.get(i);
    },
    findRow(i: number) {
      thrower("findRow");
      return rows.get(i);
    },
    getColumn(i: number) {
      thrower("getColumn");
      if (!this._columns) this._columns = [];
      while (this._columns.length < i) this._columns.push(blankColumn());
      return this._columns[i - 1];
    },
    getImages() {
      thrower("getImages");
      return images.slice();
    },
  };
  return { spec, rows, images, created, worksheet, loadedColumns: columns ? columns.slice() : null };
}

interface Book {
  workbook: object;
  sheets: SheetState[];
}

function makeWorkbook(entries: (SheetSpec | Raw)[]): Book {
  const states = entries.map((e) => (e instanceof Raw ? e : makeSheet(e)));
  const workbook = {
    eachSheet(cb: (worksheet: unknown, id: number) => void) {
      states.forEach((s, i) => cb(s instanceof Raw ? s.raw : s.worksheet, i + 1));
    },
  };
  books.set(workbook, states);
  return { workbook, sheets: states.filter((s): s is SheetState => !(s instanceof Raw)) };
}

// ---------------------------------------------------------------------------
// The library's conversion, as the spec describes it: rows and cells that do
// not exist are skipped; a row is its height in px, 24 when missing, 0.1 when
// hidden; a column is 6 x width px, 80 when missing, 0.1 when hidden; columns
// past the largest cell index of the non-hidden rows are dropped, and
// `worksheet._columns` is replaced with the shorter array; cols.len is
// max(kept columns, 20); each cell's style is deep-cloned and a numeric
// font.size becomes Math.round(size / 1.333333). One sheet per worksheet, in
// eachSheet order.
// ---------------------------------------------------------------------------

interface GridCell {
  text: string;
  style?: number;
}
interface GridRow {
  height: number;
  hidden?: boolean;
  cells: Record<number, GridCell>;
}
interface GridCol {
  width: number;
  hidden?: boolean;
}
interface GridSheet {
  name: string;
  styles: Record<string, unknown>[];
  rows: Record<string, GridRow> & { len: number };
  cols: Record<string, GridCol> & { len: number };
  merges: string[];
  media: ImageRange[];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function copyRange(range: ImageRange): ImageRange {
  const out: ImageRange = {};
  if (range.tl && typeof range.tl === "object") out.tl = { ...range.tl };
  if (range.br && typeof range.br === "object") out.br = { ...range.br };
  if (range.ext && typeof range.ext === "object") out.ext = { ...range.ext };
  return out;
}

function convertSheet(s: SheetState): GridSheet {
  const styles: Record<string, unknown>[] = [];
  const rows = { len: 0 } as GridSheet["rows"];
  let maxCol = 0;
  for (const [n, row] of [...s.rows].sort(([a], [b]) => a - b)) {
    if (!(row instanceof FakeRow)) continue;
    const cells: Record<number, GridCell> = {};
    const own = rowCells.get(row)!;
    for (const c of [...own.keys()].sort((x, y) => x - y)) {
      const cell = own.get(c)!;
      const entry: GridCell = { text: cell.value === null || cell.value === undefined ? "" : String(cell.value) };
      if (cell.style && typeof cell.style === "object") {
        const st = clone(cell.style) as Record<string, unknown> & { font?: Font };
        if (st.font && typeof st.font === "object" && typeof st.font.size === "number") {
          st.font.size = Math.round(st.font.size / 1.333333);
        }
        entry.style = styles.push(st) - 1;
      }
      cells[c - 1] = entry;
    }
    const height = row.hidden ? 0.1 : typeof row.height === "number" ? row.height : 24;
    rows[n - 1] = { height, ...(row.hidden ? { hidden: true } : {}), cells };
    rows.len = Math.max(rows.len, n);
    if (!row.hidden) maxCol = Math.max(maxCol, row.cellCount);
  }
  const all = Array.isArray(s.worksheet._columns) ? s.worksheet._columns : [];
  if (Array.isArray(s.worksheet._columns)) s.worksheet._columns = all.slice(0, maxCol);
  const cols = { len: Math.max(maxCol, 20) } as GridSheet["cols"];
  for (let c = 1; c <= maxCol; c++) {
    const col = all[c - 1] as ColSpec | undefined;
    const usable = col && typeof col === "object";
    const hidden = usable ? Boolean(col.hidden) : false;
    const width = hidden ? 0.1 : usable && typeof col.width === "number" ? 6 * col.width : 80;
    cols[c - 1] = { width, ...(hidden ? { hidden: true } : {}) };
  }
  const media = s.images
    .filter(
      (img): img is { range: ImageRange } =>
        !!img && typeof img === "object" && !!(img as { range?: unknown }).range,
    )
    .map((img) => copyRange(img.range));
  return { name: s.spec.name, styles, rows, cols, merges: [...(s.spec.merges ?? [])], media };
}

function convert(book: unknown): GridSheet[] {
  const states = book && typeof book === "object" ? books.get(book) : undefined;
  if (!states) throw new Error("not a workbook");
  return states.map((s) =>
    s instanceof Raw
      ? ({ name: "", styles: [], rows: { len: 0 }, cols: { len: 20 }, merges: [], media: [] } as unknown as GridSheet)
      : convertSheet(s),
  );
}

// ---------------------------------------------------------------------------
// The library instance and its grid.
// ---------------------------------------------------------------------------

type Options = Record<string, unknown> & {
  beforeTransformData?: unknown;
  transformData?: unknown;
};
type Snapshot = unknown;

interface Drawing {
  options: Options;
  book: Book;
  xs: {
    datas: unknown;
    loadData: (d: unknown) => void;
    sheet: { data: unknown; reload: () => void; resetData: (d: unknown) => void };
  };
  destroy: ReturnType<typeof vi.fn>;
  /** Workbooks handed to `beforeTransformData`, and what it returned. */
  given: unknown[];
  returned: unknown[];
  /** Sheets handed to `transformData`. */
  passed: unknown[];
  /** What the grid received, by reference. */
  loaded: unknown[];
  /** The sheets copied when the grid received them: its first render. */
  firstRender: Snapshot;
  /** The sheets copied at every reload after `preview` resolved. */
  reloadsAfterPreview: Snapshot[];
}

interface LibraryBehaviour {
  callsBefore?: boolean;
  callsTransform?: boolean;
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

function snapshot(sheets: unknown): Snapshot {
  try {
    return clone(sheets);
  } catch {
    return "!";
  }
}

/** Installs a library whose n-th drawing loads the workbook `load(n)`. */
function installLibrary(load: (index: number) => Book, behaviour: LibraryBehaviour = {}) {
  const callsBefore = behaviour.callsBefore ?? true;
  const callsTransform = behaviour.callsTransform ?? true;
  lib.init.mockImplementation((container: HTMLElement, options: Options = {}) => {
    let previewed = false;
    const index = drawings.length;
    const book = load(index);
    const drawing: Drawing = {
      options,
      book,
      xs: {
        datas: [],
        loadData: (d: unknown) => {
          drawing.loaded.push(d);
          drawing.xs.datas = d;
          if (Array.isArray(d)) drawing.xs.sheet.data = d[0];
          drawing.firstRender = snapshot(d);
        },
        sheet: {
          data: undefined,
          reload: () => {
            if (previewed) drawing.reloadsAfterPreview.push(snapshot(drawing.xs.datas));
          },
          resetData: (d: unknown) => {
            drawing.xs.sheet.data = d;
          },
        },
      },
      destroy: vi.fn(),
      given: [],
      returned: [],
      passed: [],
      loaded: [],
      firstRender: undefined,
      reloadsAfterPreview: [],
    };
    drawings.push(drawing);
    return {
      xs: drawing.xs,
      preview: async (data: unknown) => {
        const id = await idOfBody(data);
        let workbook: unknown = book.workbook;
        const before = options?.beforeTransformData;
        if (callsBefore && typeof before === "function") {
          drawing.given.push(workbook);
          workbook = before(workbook);
          drawing.returned.push(workbook);
        }
        let sheets: unknown = convert(workbook);
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

// ---------------------------------------------------------------------------
// Reading the grid.
// ---------------------------------------------------------------------------

const near = (actual: unknown, expected: number, label: string) => {
  expect(typeof actual, label).toBe("number");
  expect(Math.abs((actual as number) - expected), `${label}: ${String(actual)} vs ${expected}`).toBeLessThanOrEqual(1e-9);
};

const sheetsOf = (s: unknown) => s as GridSheet[];
const rowOf = (sheet: GridSheet, n: number) => sheet.rows[n - 1] as GridRow | undefined;
const heightOf = (sheet: GridSheet, n: number) => rowOf(sheet, n)?.height;
const widthOf = (sheet: GridSheet, c: number) => (sheet.cols[c - 1] as GridCol | undefined)?.width;
/** The width the mocked grid draws worksheet column `c` at: 80 for a key with no entry. */
const drawnWidth = (sheet: GridSheet, c: number) => {
  expect(c, `column ${c} is within cols.len ${sheet.cols.len}`).toBeLessThanOrEqual(sheet.cols.len);
  return widthOf(sheet, c) ?? 80;
};
function sizeOf(sheet: GridSheet, r: number, c: number): unknown {
  const cell = rowOf(sheet, r)?.cells[c - 1];
  if (!cell || cell.style === undefined) return "no style";
  const font = sheet.styles[cell.style]?.font as Font | undefined;
  return font ? font.size : "no font";
}
const rowNumbers = (sheet: GridSheet) =>
  Object.keys(sheet.rows)
    .filter((k) => k !== "len")
    .map((k) => Number(k) + 1)
    .sort((a, b) => a - b);
const colNumbers = (sheet: GridSheet) =>
  Object.keys(sheet.cols)
    .filter((k) => k !== "len")
    .map((k) => Number(k) + 1)
    .sort((a, b) => a - b);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ---------------------------------------------------------------------------
// A workbook with every kind of part, and what the grid must receive for it.
// ---------------------------------------------------------------------------

function standardBook() {
  const shared: Font = { name: "Calibri", size: 10 };
  const body: Font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFF0000" } };
  const big: Font = { name: "Arial", size: 14, italic: true };
  const small: Font = { name: "Arial", size: 8 };
  const unsized: Font = { name: "Arial", bold: true };
  const pictureA: { range: ImageRange } = {
    range: {
      tl: { nativeCol: 0, nativeColOff: 95250, nativeRow: 1, nativeRowOff: 19050 },
      br: { nativeCol: 3, nativeColOff: 38100, nativeRow: 6, nativeRowOff: 0 },
    },
  };
  const pictureB: { range: ImageRange } = {
    range: {
      tl: { nativeCol: 1, nativeColOff: 12700, nativeRow: 4, nativeRowOff: 25400 },
      ext: { width: 300, height: 150 },
    },
  };
  const book = makeWorkbook([
    {
      name: "Sheet1",
      properties: { defaultRowHeight: 15, defaultColWidth: 14.43 },
      rows: {
        1: {
          height: 15,
          cells: {
            1: { value: "日付", style: { font: shared, alignment: { wrapText: true } } },
            2: { value: 1, style: { font: body, fill: { type: "pattern", fgColor: { argb: "FFEEEEEE" } } } },
            3: { value: null, style: { font: { name: "Arial", size: 9 } } },
          },
        },
        2: {
          cells: {
            1: { value: "x", style: { font: shared } },
            4: { value: "y", style: { font: big, border: { top: { style: "thin" } } } },
          },
        },
        3: {
          hidden: true,
          height: 30,
          cells: { 1: { value: "h", style: { font: small } }, 6: { value: "wide hidden" } },
        },
        150: { height: 30, cells: { 2: { value: "far", style: { font: shared } } } },
      },
      cols: { 1: { width: 12.71 }, 3: { width: 10, hidden: true } },
      images: [pictureA, pictureB],
      merges: ["A1:B1"],
    },
    {
      name: "Sheet2",
      properties: { defaultRowHeight: 18 },
      rows: {
        1: {
          cells: {
            1: { value: "s2", style: { font: shared } },
            2: { value: "u", style: { font: unsized } },
          },
        },
      },
    },
  ]);
  return { book, fonts: { shared, body, big, small, unsized }, pictures: { pictureA, pictureB } };
}

/** The scaled grid for `standardBook()`, from the spec's formulas. */
function expectStandardScaled(sheets: GridSheet[]) {
  const [one, two] = sheets;
  near(heightOf(one, 1), 20, "Sheet1 row 1 (15 pt)");
  near(heightOf(one, 2), 20, "Sheet1 row 2 (default 15 pt)");
  expect(heightOf(one, 3)).toBe(0.1);
  expect(rowOf(one, 3)?.hidden).toBe(true);
  for (const n of range(4, 100)) near(heightOf(one, n), 20, `Sheet1 row ${n}`);
  expect(rowOf(one, 101)).toBeUndefined();
  near(heightOf(one, 150), 40, "Sheet1 row 150 (30 pt)");

  expect(one.cols.len).toBe(20);
  expect(colNumbers(one)).toEqual(range(1, 20));
  near(widthOf(one, 1), 89, "Sheet1 col 1 (12.71)");
  near(widthOf(one, 2), 101, "Sheet1 col 2 (default 14.43)");
  expect(widthOf(one, 3)).toBe(0.1);
  near(widthOf(one, 4), 101, "Sheet1 col 4 (default 14.43)");
  for (const c of range(5, 20)) near(widthOf(one, c), 101, `Sheet1 col ${c}, right of the last cell column`);

  near(sizeOf(one, 1, 1), 13.01, "10 pt");
  near(sizeOf(one, 1, 2), 15.01, "11 pt");
  near(sizeOf(one, 2, 1), 13.01, "10 pt, shared");
  near(sizeOf(one, 2, 4), 19.01, "14 pt");
  near(sizeOf(one, 3, 1), 11.01, "8 pt, hidden row");
  near(sizeOf(one, 150, 2), 13.01, "10 pt, row 150");

  const [a, b] = one.media;
  near(a.tl?.nativeColOff, 127000, "picture A tl.nativeColOff");
  near(a.tl?.nativeRowOff, 25400, "picture A tl.nativeRowOff");
  near(a.br?.nativeColOff, 50800, "picture A br.nativeColOff");
  near(a.br?.nativeRowOff, 0, "picture A br.nativeRowOff");
  near(b.tl?.nativeColOff, (12700 * 4) / 3, "picture B tl.nativeColOff");
  near(b.tl?.nativeRowOff, (25400 * 4) / 3, "picture B tl.nativeRowOff");
  near(b.ext?.width, 400, "picture B ext.width");
  near(b.ext?.height, 200, "picture B ext.height");
  expect([a.tl?.nativeCol, a.tl?.nativeRow, a.br?.nativeCol, a.br?.nativeRow]).toEqual([0, 1, 3, 6]);

  for (const n of range(1, 100)) near(heightOf(two, n), 24, `Sheet2 row ${n} (default 18 pt)`);
  expect(two.cols.len).toBe(20);
  expect(colNumbers(two)).toEqual(range(1, 20));
  for (const c of range(1, 20)) near(widthOf(two, c), 64, `Sheet2 col ${c} (no default)`);
  near(sizeOf(two, 1, 1), 13.01, "10 pt, shared across sheets");
  expect(sizeOf(two, 1, 2)).toBeUndefined();
}

// ---------------------------------------------------------------------------
// Page helpers.
// ---------------------------------------------------------------------------

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

type Fn = (x: unknown) => unknown;

function beforeOf(drawing: Drawing): Fn {
  expect(typeof drawing.options?.beforeTransformData).toBe("function");
  return drawing.options.beforeTransformData as Fn;
}
function transformOf(drawing: Drawing): Fn {
  expect(typeof drawing.options?.transformData).toBe("function");
  return drawing.options.transformData as Fn;
}

/** Draws one workbook and returns the drawing and the sheets the grid received. */
async function draw(entries: (SheetSpec | Raw)[], behaviour: LibraryBehaviour = {}) {
  installLibrary(() => makeWorkbook(entries), behaviour);
  render(<FilePreview file={XLSX()} />);
  await shown();
  const drawing = drawings[0];
  return { drawing, grid: sheetsOf(drawing.loaded[0]), book: drawing.book };
}

/** Draws the standard workbook and returns the adapter's two functions, for direct calls. */
async function adapterFunctions() {
  installLibrary(() => standardBook().book);
  render(<FilePreview file={XLSX()} />);
  await shown();
  expectStandardScaled(sheetsOf(drawings[0].loaded[0]));
  return { before: beforeOf(drawings[0]), transform: transformOf(drawings[0]) };
}

/** The same page with a readable workbook: guard assertions are not a scaling that never runs. */
async function nextWorkbookIsScaled(rerender: (ui: React.ReactElement) => void) {
  rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
  await shown("sheet-b");
  expectStandardScaled(sheetsOf(drawings.at(-1)!.firstRender));
}

beforeEach(() => {
  drawings = [];
  observers = [];
  vi.stubGlobal("ResizeObserver", FiringResizeObserver);
  installNetwork();
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  // jsdom has no 2D context and logs when asked for one; this file is about
  // sizing, so a zero width keeps the run-on step from changing its sheets.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => ({ font: "", measureText: () => ({ width: 0 }) })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  lib.init.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("SPEC-CORE-168 normal flow: init receives beforeTransformData and transformData, and preview draws the scaled workbook", () => {
  it("passes both functions next to showContextmenu: false, and each returns what it was given", async () => {
    const { drawing } = await draw([{ name: "S", rows: { 1: { cells: { 1: { value: "a" } } } } }]);

    expect(lib.init).toHaveBeenCalledTimes(1);
    expect(drawing.options.showContextmenu).toBe(false);
    beforeOf(drawing);
    transformOf(drawing);
    expect(drawing.given).toHaveLength(1);
    expect(drawing.returned[0]).toBe(drawing.given[0]);
    expect(drawing.passed).toHaveLength(1);
    expect(drawing.loaded[0]).toBe(drawing.passed[0]);
  });

  it("the grid receives every sheet scaled to Excel's 100 % size", async () => {
    installLibrary(() => standardBook().book);
    render(<FilePreview file={XLSX()} />);
    await shown();

    expectStandardScaled(sheetsOf(drawings[0].loaded[0]));
    expectShownWithoutFallback(drawings[0]);
    expectNoConsole();
  });
});

describe("SPEC-CORE-168 I1 rows 1 to 100 and every existing row after them are drawn at (height, else positive default, else 15) x 4/3", () => {
  it("scales set heights, fills defaults, keeps hidden rows hidden, and creates no row past 100", async () => {
    const { grid, book } = await draw([
      {
        name: "Rows",
        properties: { defaultRowHeight: 15 },
        rows: {
          1: { height: 15, cells: { 1: { value: "a" } } },
          2: { height: 16 },
          3: { height: 12.75 },
          4: { hidden: true, height: 30 },
          100: { height: 30 },
          150: { height: 30, cells: { 1: { value: "b" } } },
          151: {},
          5000: { cells: { 1: { value: "stray", style: { font: { name: "Arial", size: 9 } } } } },
        },
      },
    ]);
    const sheet = grid[0];

    near(heightOf(sheet, 1), 20, "15 pt");
    near(heightOf(sheet, 2), 64 / 3, "16 pt stays fractional");
    near(heightOf(sheet, 3), 17, "12.75 pt");
    expect(heightOf(sheet, 4)).toBe(0.1);
    expect(rowOf(sheet, 4)?.hidden).toBe(true);
    for (const n of range(5, 99)) near(heightOf(sheet, n), 20, `row ${n}, created`);
    near(heightOf(sheet, 100), 40, "row 100, 30 pt");
    near(heightOf(sheet, 150), 40, "row 150, 30 pt");
    near(heightOf(sheet, 151), 20, "row 151, default");
    near(heightOf(sheet, 5000), 20, "row 5000, default");
    near(sizeOf(sheet, 5000, 1), 12.01, "9 pt reached only from row 5000");
    expect(rowNumbers(sheet)).toEqual([...range(1, 100), 150, 151, 5000]);
    for (const n of book.sheets[0].created) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(100);
    }
  });

  it("a sheet with no rows gets rows 1 to 100 at its default, and its 20 grid columns at the default width", async () => {
    const { grid, book } = await draw([{ name: "Empty", properties: { defaultRowHeight: 15 } }]);

    expect(rowNumbers(grid[0])).toEqual(range(1, 100));
    for (const n of range(1, 100)) near(heightOf(grid[0], n), 20, `row ${n}`);
    expect(grid[0].cols.len).toBe(20);
    for (const c of range(1, 20)) near(drawnWidth(grid[0], c), 64, `column ${c}, no default`);
    expect(book.sheets[0].created.every((n) => n >= 1 && n <= 100)).toBe(true);
  });

  const defaults: [string, unknown, number][] = [
    ["default 15", { defaultRowHeight: 15 }, 20],
    ["default 18", { defaultRowHeight: 18 }, 24],
    ["default 12.75", { defaultRowHeight: 12.75 }, 17],
    ["default 0 (ExcelJS's missing)", { defaultRowHeight: 0 }, 20],
    ["default negative", { defaultRowHeight: -3 }, 20],
    ["default a string", { defaultRowHeight: "18" }, 20],
    ["default NaN", { defaultRowHeight: Number.NaN }, 20],
    ["no default", {}, 20],
    ["properties missing", undefined, 20],
  ];
  it.each(defaults)("a row without a height, %s, is drawn at its default x 4/3", async (_, properties, px) => {
    const { grid } = await draw([
      { name: "D", properties, rows: { 1: { cells: { 1: { value: "a" } } }, 150: {} } },
    ]);

    near(heightOf(grid[0], 1), px, "row 1");
    near(heightOf(grid[0], 50), px, "row 50, created");
    near(heightOf(grid[0], 150), px, "row 150, existing");
  });

  const heights: [string, unknown][] = [
    ["0", 0],
    ["negative", -1],
    ["a string", "20"],
    ["NaN", Number.NaN],
    ["null", null],
  ];
  it.each(heights)("a row height that is %s counts as missing", async (_, height) => {
    const { grid } = await draw([
      { name: "H", properties: { defaultRowHeight: 21 }, rows: { 1: { height }, 150: { height } } },
    ]);

    near(heightOf(grid[0], 1), 28, "row 1");
    near(heightOf(grid[0], 150), 28, "row 150");
  });
});

describe("SPEC-CORE-168 I2 every drawn column is Math.round(width x 7) px, else Math.round(positive default x 7), else 64", () => {
  it("scales set widths, fills defaults, keeps hidden columns hidden, through the widest visible row", async () => {
    const { grid } = await draw([
      {
        name: "Cols",
        properties: { defaultRowHeight: 15, defaultColWidth: 14.43 },
        rows: {
          1: { cells: { 1: { value: 1 }, 7: { value: 7 } } },
          2: { hidden: true, cells: { 12: { value: "hidden row, wider" } } },
          150: { cells: { 9: { value: "far" } } },
        },
        cols: {
          1: { width: 12.71 },
          3: { width: 0 },
          4: { width: -2 },
          5: { width: 0.05 },
          6: { width: 20, hidden: true },
          7: { width: 10 },
          9: { width: 9.14 },
        },
      },
    ]);
    const sheet = grid[0];

    expect(sheet.cols.len).toBe(20);
    near(widthOf(sheet, 1), 89, "12.71 characters");
    near(widthOf(sheet, 2), 101, "no width, default 14.43");
    near(widthOf(sheet, 3), 101, "width 0");
    near(widthOf(sheet, 4), 101, "negative width");
    near(widthOf(sheet, 5), 101, "width rounding to 0 px");
    expect(widthOf(sheet, 6)).toBe(0.1);
    expect((sheet.cols[5] as GridCol).hidden).toBe(true);
    near(widthOf(sheet, 7), 70, "10 characters");
    near(widthOf(sheet, 8), 101, "no width, default 14.43");
    near(widthOf(sheet, 9), 64, "9.14 characters");
    for (const c of range(10, 20)) near(drawnWidth(sheet, c), 101, `column ${c}, right of the last cell column`);
  });

  it("one cell: its column and the 19 the grid adds are all at the default width", async () => {
    const { grid } = await draw([
      { name: "One", properties: { defaultColWidth: 8.43 }, rows: { 1: { cells: { 1: { value: 1 } } } } },
    ]);

    expect(grid[0].cols.len).toBe(20);
    for (const c of range(1, 20)) near(drawnWidth(grid[0], c), 59, `column ${c}, default 8.43`);
  });

  const defaults: [string, unknown, number][] = [
    ["default 14.43", { defaultColWidth: 14.43 }, 101],
    ["default 8.43", { defaultColWidth: 8.43 }, 59],
    ["default 0 (ExcelJS's missing)", { defaultColWidth: 0 }, 64],
    ["default negative", { defaultColWidth: -1 }, 64],
    ["default a string", { defaultColWidth: "10" }, 64],
    ["no default", {}, 64],
    ["properties missing", undefined, 64],
  ];
  it.each(defaults)("a column without a width, %s, is drawn at Math.round(default x 7), else 64", async (_, properties, px) => {
    const { grid } = await draw([
      { name: "D", properties, rows: { 1: { cells: { 1: { value: 1 }, 2: { value: 2 } } } }, cols: { 2: {} } },
    ]);

    near(widthOf(grid[0], 1), px, "column with no object");
    near(widthOf(grid[0], 2), px, "column with no width");
    near(drawnWidth(grid[0], 3), px, "column right of the last cell column");
    near(drawnWidth(grid[0], 20), px, "last grid column");
  });
});

describe("SPEC-CORE-168 I2 and I8 columns right of the last cell column, which the library drops, are drawn at their own width, and worksheet._columns is put back", () => {
  it("fills every grid column the library dropped from the width as loaded, and puts every column object back", async () => {
    const { grid, book } = await draw([
      {
        name: "Dropped",
        properties: { defaultRowHeight: 15, defaultColWidth: 14.43 },
        rows: {
          1: { cells: { 1: { value: "a" }, 3: { value: "c" } } },
          2: { hidden: true, cells: { 12: { value: "hidden row reaches column 12" } } },
        },
        cols: {
          1: { width: 12.71 },
          2: { width: 10 },
          4: { width: 10.29 },
          5: { width: 20, hidden: true },
          6: {},
          7: { width: 0 },
          8: { width: 12.71 },
          10: { width: 10.29 },
          11: { width: 15, hidden: true },
          12: { width: 0.05 },
          14: { width: 9.14 },
          25: { width: 10 },
        },
      },
    ]);
    const sheet = grid[0];
    const ws = book.sheets[0];
    const expected: Record<number, number> = {
      1: 89,
      2: 70,
      3: 101,
      4: 72,
      5: 0.1,
      6: 101,
      7: 101,
      8: 89,
      9: 101,
      10: 72,
      11: 0.1,
      12: 101,
      13: 101,
      14: 64,
    };
    for (const c of range(15, 20)) expected[c] = 101;

    expect(sheet.cols.len).toBe(20);
    for (const c of range(1, 20)) near(drawnWidth(sheet, c), expected[c], `column ${c}`);
    expect(sheet.cols[20]).toBeUndefined();

    const loaded = ws.loadedColumns!;
    const after = ws.worksheet._columns;
    expect(Array.isArray(after), "worksheet._columns is an array").toBe(true);
    expect(after!.length).toBe(25);
    loaded.forEach((col, i) => expect(after![i], `column object ${i + 1}`).toBe(col));
    const scaledPx: Record<number, number> = { ...expected, 5: 140, 11: 105, 25: 70 };
    for (const c of range(21, 24)) scaledPx[c] = 101;
    for (const c of range(1, 25)) {
      const col = after![c - 1] as ColSpec;
      near(col.width, scaledPx[c] / 6, `column ${c} width in worksheet._columns`);
    }
    expect((after![4] as ColSpec).hidden).toBe(true);
    expect((after![10] as ColSpec).hidden).toBe(true);
  });

  it("19 kept columns get one filled, 20 and 21 get none, and the columns past them are put back", async () => {
    const cellsTo = (n: number) => Object.fromEntries(range(1, n).map((c) => [c, { value: c }]));
    const { grid, book } = await draw([
      { name: "Kept19", properties: { defaultColWidth: 8.43 }, rows: { 1: { cells: cellsTo(19) } }, cols: { 20: { width: 10.29 } } },
      { name: "Kept20", properties: { defaultColWidth: 8.43 }, rows: { 1: { cells: cellsTo(20) } }, cols: { 22: { width: 10.29 } } },
      { name: "Kept21", properties: { defaultColWidth: 8.43 }, rows: { 1: { cells: cellsTo(21) } }, cols: { 23: { width: 12.71 } } },
    ]);
    const [k19, k20, k21] = grid;

    expect(k19.cols.len).toBe(20);
    for (const c of range(1, 19)) near(widthOf(k19, c), 59, `Kept19 column ${c}`);
    near(drawnWidth(k19, 20), 72, "Kept19 column 20, right of the last cell column");

    expect(k20.cols.len).toBe(20);
    for (const c of range(1, 20)) near(widthOf(k20, c), 59, `Kept20 column ${c}`);
    expect(k20.cols[20]).toBeUndefined();

    expect(k21.cols.len).toBe(21);
    for (const c of range(1, 21)) near(widthOf(k21, c), 59, `Kept21 column ${c}`);
    expect(k21.cols[21]).toBeUndefined();

    for (const [i, n, last] of [
      [0, 20, 72],
      [1, 22, 72],
      [2, 23, 89],
    ] as const) {
      const after = book.sheets[i].worksheet._columns!;
      expect(after.length, `${book.sheets[i].spec.name} worksheet._columns length`).toBe(n);
      book.sheets[i].loadedColumns!.forEach((col, j) => expect(after[j]).toBe(col));
      near((after[n - 1] as ColSpec).width, last / 6, `${book.sheets[i].spec.name} column ${n} width`);
    }
  });
});

describe("SPEC-CORE-168 I3 text of p points is drawn at Math.round(p x 4/3) px, and every numeric size the grid receives is a whole number plus 0.01", () => {
  const sizes: [number, number][] = [
    [8, 11],
    [9, 12],
    [10, 13],
    [11, 15],
    [12, 16],
    [14, 19],
  ];
  it.each(sizes)("%s pt reaches the grid as %s + 0.01", async (points, px) => {
    const font: Font = { name: "Calibri", size: points };
    const { grid } = await draw([
      { name: "T", rows: { 1: { cells: { 1: { value: "t", style: { font } } } } } },
    ]);

    near(font.size, (points * 16) / 9, "the workbook's font after beforeTransformData");
    near(sizeOf(grid[0], 1, 1), px + 0.01, "the grid's size");
  });

  it("a font without a numeric size is left without one", async () => {
    const textSized: Font = { size: "10" };
    const nullSized: Font = { size: null };
    const unsized: Font = { name: "Arial" };
    const { grid } = await draw([
      {
        name: "T",
        rows: {
          1: {
            cells: {
              1: { value: "a", style: { font: textSized } },
              2: { value: "b", style: { font: nullSized } },
              3: { value: "c", style: { font: unsized } },
              4: { value: "d", style: { font: { size: 11 } } },
            },
          },
        },
      },
    ]);

    expect(textSized.size).toBe("10");
    expect(nullSized.size).toBeNull();
    expect("size" in unsized).toBe(false);
    expect(sizeOf(grid[0], 1, 1)).toBe("10");
    expect(sizeOf(grid[0], 1, 2)).toBeNull();
    expect(sizeOf(grid[0], 1, 3)).toBeUndefined();
    near(sizeOf(grid[0], 1, 4), 15.01, "11 pt beside them");
  });
});

describe("SPEC-CORE-168 I4 picture anchor offsets and one-cell sizes are 4/3 of the loaded values", () => {
  it("scales every present member once and leaves a missing member missing", async () => {
    const partial: { range: ImageRange } = {
      range: { tl: { nativeCol: 2, nativeColOff: 9525, nativeRow: 3 }, ext: { width: 90 } },
    };
    const onOtherSheet: { range: ImageRange } = {
      range: {
        tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 38100 },
        br: { nativeCol: 1, nativeColOff: 19050, nativeRow: 2, nativeRowOff: 9525 },
      },
    };
    const { pictures, book } = standardBook();
    const { grid } = await draw([
      { ...book.sheets[0].spec, images: [...(book.sheets[0].spec.images ?? []), partial] },
      book.sheets[1].spec,
      { name: "Pictures", images: [onOtherSheet], rows: { 1: { cells: { 1: { value: 1 } } } } },
    ]);

    const a = pictures.pictureA.range;
    near(a.tl?.nativeColOff, 127000, "A tl.nativeColOff");
    near(a.tl?.nativeRowOff, 25400, "A tl.nativeRowOff");
    near(a.br?.nativeColOff, 50800, "A br.nativeColOff");
    near(a.br?.nativeRowOff, 0, "A br.nativeRowOff");
    expect([a.tl?.nativeCol, a.tl?.nativeRow, a.br?.nativeCol, a.br?.nativeRow]).toEqual([0, 1, 3, 6]);
    const b = pictures.pictureB.range;
    near(b.ext?.width, 400, "B ext.width");
    near(b.ext?.height, 200, "B ext.height");
    expect(b.br).toBeUndefined();

    const p = partial.range;
    near(p.tl?.nativeColOff, 12700, "partial tl.nativeColOff");
    expect(p.tl?.nativeRowOff).toBeUndefined();
    expect(p.br).toBeUndefined();
    near(p.ext?.width, 120, "partial ext.width");
    expect(p.ext?.height).toBeUndefined();

    const o = grid[2].media[0];
    near(o.tl?.nativeColOff, 0, "other sheet tl.nativeColOff");
    near(o.tl?.nativeRowOff, 50800, "other sheet tl.nativeRowOff");
    near(o.br?.nativeColOff, 25400, "other sheet br.nativeColOff");
    near(o.br?.nativeRowOff, 12700, "other sheet br.nativeRowOff");
    expect(grid[0].media).toHaveLength(3);
    near(grid[0].media[2].tl?.nativeColOff, 12700, "grid partial tl.nativeColOff");
    near(grid[0].media[0].br?.nativeColOff, 50800, "grid A br.nativeColOff");
  });
});

describe("SPEC-CORE-168 I5 each font, row, column and picture is scaled once per drawing", () => {
  it("a font shared by cells, rows past 100 and sheets is scaled once, not once per reach", async () => {
    const { fonts } = standardBook();
    installLibrary(() => {
      const fresh = standardBook();
      Object.assign(fonts, fresh.fonts);
      return fresh.book;
    });
    render(<FilePreview file={XLSX()} />);
    await shown();

    near(fonts.shared.size, (10 * 16) / 9, "shared font");
    near(fonts.body.size, (11 * 16) / 9, "body font");
    near(fonts.big.size, (14 * 16) / 9, "big font");
    near(fonts.small.size, (8 * 16) / 9, "font of a hidden row");
  });

  it("transformData adds 0.01 once to a font shared by styles and sheets", async () => {
    const { transform } = await adapterFunctions();
    const shared = { size: 9 };
    const sheets = [
      { name: "A", styles: [{ font: shared }, { font: shared, align: "right" }] },
      { name: "B", styles: [{ font: shared }] },
    ];

    expect(transform(sheets)).toBe(sheets);
    near(shared.size, 9.01, "shared font");
  });

  it("reloads, frame resizes, window resizes, re-renders and a sheet switch scale nothing again", async () => {
    const picture = { pictureA: undefined as unknown as { range: ImageRange } };
    installLibrary(() => {
      const fresh = standardBook();
      picture.pictureA = fresh.pictures.pictureA;
      return fresh.book;
    });
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

    expect(drawing.given).toHaveLength(1);
    expect(drawing.passed).toHaveLength(1);
    expect(lib.init).toHaveBeenCalledTimes(1);
    expectStandardScaled(sheetsOf(drawing.xs.datas));
    for (const seen of drawing.reloadsAfterPreview) expectStandardScaled(sheetsOf(seen));
    near(picture.pictureA.range.tl?.nativeColOff, 127000, "picture in the workbook");
    const row1 = drawing.book.sheets[0].rows.get(1) as FakeRow;
    near((row1.height as number) * 1, 20, "row 1 in the workbook");
  });

  it("a new identity gets its own library instance and its own single scaling", async () => {
    installLibrary(() => standardBook().book);
    const { rerender } = render(<FilePreview file={XLSX()} />);
    await shown();

    rerender(<FilePreview file={XLSX({ id: "sheet-b" })} />);
    await shown("sheet-b");

    expect(drawings).toHaveLength(2);
    expect(drawings[1].given).toHaveLength(1);
    expect(drawings[1].passed).toHaveLength(1);
    expectStandardScaled(sheetsOf(drawings[1].firstRender));
    expectStandardScaled(sheetsOf(drawings[0].xs.datas));
  });
});

describe("SPEC-CORE-168 I6 the grid's first render after preview already uses the scaled rows, columns and sizes", () => {
  it("the sheets the grid holds when it receives them, and at the first reload, are scaled", async () => {
    installLibrary(() => standardBook().book);
    render(<FilePreview file={XLSX()} />);
    await shown();

    const drawing = drawings[0];
    expectStandardScaled(sheetsOf(drawing.firstRender));
    expect(drawing.reloadsAfterPreview.length).toBeGreaterThanOrEqual(1);
    expectStandardScaled(sheetsOf(drawing.reloadsAfterPreview[0]));
  });
});

describe("SPEC-CORE-168 I8 everything but sizes is what the library would have loaded, and no cell is created", () => {
  const withoutSize = (style: Record<string, unknown>) => {
    const copy = clone(style) as Record<string, unknown> & { font?: Font };
    if (copy.font && typeof copy.font === "object") delete copy.font.size;
    return copy;
  };

  it("cell text, other style properties, merges and hidden flags match an unscaled conversion", async () => {
    installLibrary(() => standardBook().book);
    render(<FilePreview file={XLSX()} />);
    await shown();
    const scaled = sheetsOf(drawings[0].loaded[0]);
    const plain = convert(standardBook().book.workbook);

    expect(scaled).toHaveLength(plain.length);
    plain.forEach((want, i) => {
      const got = scaled[i];
      expect(got.name).toBe(want.name);
      expect(got.merges).toEqual(want.merges);
      for (const n of rowNumbers(want)) {
        const wr = rowOf(want, n)!;
        const gr = rowOf(got, n)!;
        expect(Object.keys(gr.cells), `${want.name} row ${n} cells`).toEqual(Object.keys(wr.cells));
        expect(Boolean(gr.hidden)).toBe(Boolean(wr.hidden));
        for (const [c, cell] of Object.entries(wr.cells)) {
          const gc = gr.cells[Number(c)];
          expect(gc.text).toBe(cell.text);
          if (cell.style === undefined) expect(gc.style).toBeUndefined();
          else expect(withoutSize(got.styles[gc.style!])).toEqual(withoutSize(want.styles[cell.style]));
        }
      }
      for (const n of rowNumbers(got).filter((n) => !rowNumbers(want).includes(n))) {
        expect(n).toBeLessThanOrEqual(100);
        expect(rowOf(got, n)!.cells).toEqual({});
      }
      expect(got.cols.len).toBe(want.cols.len);
      expect(colNumbers(got).slice(0, colNumbers(want).length)).toEqual(colNumbers(want));
      for (const c of colNumbers(want)) {
        expect(Boolean(got.cols[c - 1].hidden)).toBe(Boolean(want.cols[c - 1].hidden));
      }
      expect(got.media.map((m) => [m.tl?.nativeCol, m.tl?.nativeRow, m.br?.nativeCol, m.br?.nativeRow])).toEqual(
        want.media.map((m) => [m.tl?.nativeCol, m.tl?.nativeRow, m.br?.nativeCol, m.br?.nativeRow]),
      );
    });
    expectStandardScaled(scaled);
  });

  it("an empty styled cell inside a row is not filled, and no missing cell is created", async () => {
    const { grid, book } = await draw([
      {
        name: "Gaps",
        rows: {
          1: {
            cells: {
              2: { value: null, style: { font: { size: 9 } } },
              5: { value: "e", style: { font: { size: 11 } } },
            },
          },
        },
      },
    ]);

    expect(Object.keys(rowOf(grid[0], 1)!.cells)).toEqual(["1", "4"]);
    const row1 = book.sheets[0].rows.get(1) as FakeRow;
    expect(row1.cellCount).toBe(5);
    near(sizeOf(grid[0], 1, 5), 15.01, "11 pt");
  });
});

describe("SPEC-CORE-168 I7 a workbook of unexpected shape, or a scaling that throws, is still shown with no fallback, dispose or console output", () => {
  const notWorkbooks: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a number", 7],
    ["a string", "workbook"],
    ["an object without eachSheet", {}],
    ["eachSheet not a function", { eachSheet: "no" }],
  ];
  it.each(notWorkbooks)("beforeTransformData given %s returns it without throwing", async (_, odd) => {
    const { before } = await adapterFunctions();

    let out: unknown;
    expect(() => {
      out = before(odd);
    }).not.toThrow();
    expect(out).toBe(odd);
    expectNoConsole();
  });

  it("skips worksheets, rows, cells, columns and pictures of unexpected shape and scales the rest", async () => {
    const good: Font = { size: 11 };
    const kept: Font = { size: 14 };
    const picture: { range: ImageRange } = { range: { tl: { nativeCol: 0, nativeColOff: 9525, nativeRow: 0, nativeRowOff: 0 } } };
    const { drawing, grid } = await draw([
      new Raw(null),
      new Raw(7),
      new Raw({}),
      new Raw({ name: "Members missing", properties: { defaultRowHeight: 15 } }),
      {
        name: "Odd parts",
        properties: { defaultRowHeight: 15, defaultColWidth: 10 },
        rows: {
          1: {
            cells: {
              1: { value: "no style" },
              2: { value: "style not an object", style: 7 },
              3: { value: "no font", style: {} },
              4: { value: "null font", style: { font: null } },
              5: { value: "number font", style: { font: 7 } },
              6: { value: "good", style: { font: good } },
            },
          },
        },
        oddRows: { 2: null, 3: 5, 4: { height: 10 } },
        oddCols: { 2: null, 3: 7 },
        images: [null, 3, {}, { range: null }, { range: {} }, picture],
      },
      { name: "After", rows: { 1: { height: 15, cells: { 1: { value: "k", style: { font: kept } } } } } },
    ]);

    near(good.size, (11 * 16) / 9, "good font");
    near(kept.size, (14 * 16) / 9, "font on the next sheet");
    near(picture.range.tl?.nativeColOff, 12700, "good picture");
    expect(grid.map((g) => g.name)).toEqual(["", "", "", "", "Odd parts", "After"]);
    near(heightOf(grid[4], 1), 20, "row 1 beside odd rows");
    near(heightOf(grid[4], 5), 20, "row 5 beside odd rows");
    near(widthOf(grid[4], 1), 70, "column 1 beside odd columns");
    near(widthOf(grid[4], 6), 70, "column 6 beside odd columns");
    for (const c of range(7, 20)) near(drawnWidth(grid[4], c), 70, `column ${c} after odd columns`);
    near(sizeOf(grid[4], 1, 6), 15.01, "good font in the grid");
    near(heightOf(grid[5], 1), 20, "next sheet row 1");
    for (const c of range(2, 20)) near(drawnWidth(grid[5], c), 64, `next sheet column ${c}`);
    for (const g of grid.slice(0, 4)) {
      for (const c of range(1, 20)) expect(drawnWidth(g, c), `${c} on a skipped worksheet`).toBe(80);
    }
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  const throwers: Thrower[] = ["properties", "rowCount", "getRow", "findRow", "getColumn", "columns", "getImages"];
  it.each(throwers)(
    "a worksheet whose %s throws: what was scaled stays, the workbook it was given is returned and shown",
    async (member) => {
      const first: Font = { size: 11 };
      const middle: Font = { size: 9 };
      const last: Font = { size: 14 };
      const lastPicture: { range: ImageRange } = { range: { ext: { width: 30, height: 60 } } };
      installLibrary((i) =>
        i !== 0
          ? standardBook().book
          : makeWorkbook([
              {
                name: "First",
                properties: { defaultRowHeight: 15, defaultColWidth: 10 },
                rows: { 1: { cells: { 1: { value: "a", style: { font: first } } } }, 150: { height: 30 } },
              },
              {
                name: "Throws",
                properties: { defaultRowHeight: 15 },
                rows: { 1: { cells: { 1: { value: "m", style: { font: middle } } } }, 150: {} },
                images: [{ range: { ext: { width: 3, height: 6 } } }],
                throwIn: member,
              },
              {
                name: "Last",
                properties: { defaultRowHeight: 15 },
                rows: { 1: { height: 15, cells: { 1: { value: "z", style: { font: last } } } } },
                images: [lastPicture],
              },
            ]),
      );
      const { rerender } = render(<FilePreview file={XLSX()} />);
      await shown();

      const drawing = drawings[0];
      beforeOf(drawing);
      expect(drawing.returned[0]).toBe(drawing.given[0]);
      const grid = sheetsOf(drawing.loaded[0]);
      near(first.size, (11 * 16) / 9, "font before the throw");
      for (const n of range(1, 100)) near(heightOf(grid[0], n), 20, `First row ${n}`);
      near(heightOf(grid[0], 150), 40, "First row 150");
      near(widthOf(grid[0], 1), 70, "First column 1");
      for (const c of range(2, 20)) near(drawnWidth(grid[0], c), 70, `First column ${c}, filled`);
      for (const c of range(2, 20)) expect(drawnWidth(grid[1], c), `Throws column ${c}, no fill`).toBe(80);
      for (const c of range(2, 20)) {
        const w = drawnWidth(grid[2], c);
        expect(w === 80 || Math.abs(w - 64) <= 1e-9, `Last column ${c}: ${w}`).toBe(true);
      }
      near(sizeOf(grid[0], 1, 1), 15.01, "First font in the grid");
      for (const [label, value, loaded] of [
        ["middle font", middle.size, 9],
        ["last font", last.size, 14],
        ["last picture width", lastPicture.range.ext?.width, 30],
      ] as const) {
        const ok = value === loaded || Math.abs((value as number) - (loaded * (label.includes("font") ? 16 / 9 : 4 / 3))) <= 1e-9;
        expect(ok, `${label}: ${String(value)}`).toBe(true);
      }
      const lastRow1 = heightOf(grid[2], 1);
      expect(lastRow1 === 15 || Math.abs((lastRow1 as number) - 20) <= 1e-9, `Last row 1: ${lastRow1}`).toBe(true);
      expectShownWithoutFallback(drawing);
      expectNoConsole();
      await nextWorkbookIsScaled(rerender);
    },
  );

  it("an empty workbook is shown", async () => {
    const { drawing, grid } = await draw([]);

    beforeOf(drawing);
    expect(drawing.returned[0]).toBe(drawing.given[0]);
    expect(grid).toEqual([]);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  const notArrays: [string, () => unknown][] = [
    ["undefined", () => undefined],
    ["null", () => null],
    ["a string", () => "sheets"],
    ["an array-like object", () => ({ length: 1, 0: { name: "S", styles: [{ font: { size: 6 } }] } })],
  ];
  it.each(notArrays)("transformData given %s returns it unchanged", async (_, odd) => {
    const { transform } = await adapterFunctions();
    const given = odd();

    let out: unknown;
    expect(() => {
      out = transform(given);
    }).not.toThrow();
    expect(out).toBe(given);
    if (given && typeof given === "object") {
      expect((given as { 0: { styles: { font: { size: number } }[] } })[0].styles[0].font.size).toBe(6);
    }
    expectNoConsole();
  });

  it("transformData skips sheets and styles of unexpected shape and adds 0.01 to the rest", async () => {
    const { transform } = await adapterFunctions();
    const good = { size: 9 };
    const alsoGood = { size: 14 };
    const textSized = { size: "8" };
    const nullSized = { size: null };
    const undefinedSized = { size: undefined };
    const unsized = { name: "Arial" };
    const sheets = [
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
    ];

    expect(transform(sheets)).toBe(sheets);
    near(good.size, 9.01, "good");
    near(alsoGood.size, 14.01, "also good");
    expect(textSized.size).toBe("8");
    expect(nullSized.size).toBeNull();
    expect(undefinedSized.size).toBeUndefined();
    expect("size" in unsized).toBe(false);
    expectNoConsole();
  });

  it("transformData that throws partway returns the list it was given, each size loaded or plus 0.01 once", async () => {
    const { transform } = await adapterFunctions();
    const first = { size: 6 };
    const last = { size: 8 };
    let trapsHit = 0;
    const given = [
      { name: "First", styles: [{ font: first }] },
      {
        name: "Throws",
        get styles(): unknown {
          trapsHit += 1;
          throw new Error("unreadable styles");
        },
      },
      {
        name: "Mid",
        styles: [
          {
            font: {
              get size(): number {
                trapsHit += 1;
                throw new Error("unreadable size");
              },
            },
          },
          {
            get font(): unknown {
              trapsHit += 1;
              throw new Error("unreadable font");
            },
          },
        ],
      },
      { name: "Last", styles: [{ font: last }] },
    ];

    let out: unknown;
    expect(() => {
      out = transform(given);
    }).not.toThrow();
    expect(out).toBe(given);
    expect(trapsHit).toBeGreaterThan(0);
    expect([6, 6.01]).toContain(first.size);
    expect([8, 8.01]).toContain(last.size);
    expectNoConsole();
  });

  it("a build that never calls beforeTransformData shows the workbook at the library's sizes, with 0.01 added", async () => {
    const { book, fonts } = standardBook();
    const { drawing, grid } = await (async () => {
      installLibrary(() => book, { callsBefore: false });
      render(<FilePreview file={XLSX()} />);
      await shown();
      return { drawing: drawings[0], grid: sheetsOf(drawings[0].loaded[0]) };
    })();

    beforeOf(drawing);
    expect(fonts.body.size).toBe(11);
    expect(heightOf(grid[0], 1)).toBe(15);
    expect(heightOf(grid[0], 2)).toBe(24);
    expect(rowOf(grid[0], 4)).toBeUndefined();
    near(widthOf(grid[0], 1), 6 * 12.71, "column 1 as the library draws it");
    near(sizeOf(grid[0], 1, 2), 8.01, "11 pt as the library draws it");
    for (const c of range(5, 20)) expect(drawnWidth(grid[0], c), `column ${c}, no record`).toBe(80);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("a build that never calls transformData shows the scaled workbook with whole sizes", async () => {
    const { drawing, grid } = await (async () => {
      installLibrary(() => standardBook().book, { callsTransform: false });
      render(<FilePreview file={XLSX()} />);
      await shown();
      return { drawing: drawings[0], grid: sheetsOf(drawings[0].loaded[0]) };
    })();

    transformOf(drawing);
    near(heightOf(grid[0], 1), 20, "row 1");
    near(widthOf(grid[0], 1), 89, "column 1");
    expect(sizeOf(grid[0], 1, 1)).toBe(13);
    expect(sizeOf(grid[0], 1, 2)).toBe(15);
    expectShownWithoutFallback(drawing);
    expectNoConsole();
  });

  it("preview rejecting for its own reasons keeps today's fallback, and the next workbook is scaled", async () => {
    installLibrary(() => standardBook().book);
    lib.init.mockImplementationOnce(() => {
      const xs = {
        datas: [] as unknown[],
        loadData: () => {},
        sheet: { reload: () => {}, resetData: () => {} },
      };
      drawings.push({ xs } as unknown as Drawing);
      return {
        xs,
        preview: async () => {
          throw new Error("corrupt workbook");
        },
        destroy: vi.fn(),
      };
    });
    const { rerender } = render(<FilePreview file={XLSX()} />);

    expect(await screen.findByRole("heading", { name: FALLBACK_HEADING })).toBeInTheDocument();
    await settle();
    await nextWorkbookIsScaled(rerender);
  });
});
