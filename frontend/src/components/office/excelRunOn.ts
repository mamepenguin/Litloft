type UnknownRecord = Record<string, unknown>;

interface Range {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

interface Layout {
  cols: UnknownRecord;
  styles: unknown[];
  merges: unknown[];
  ranges: Range[];
  columnCount: number;
}

interface Font {
  css: string;
  px: number;
}

type ContextOf = () => CanvasRenderingContext2D | null;

const DEFAULT_CELL_WIDTH = 80;
const DEFAULT_FONT_PX = 13;
const A1_RANGE = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;
// The grid insets left-aligned text 5 px and clips 1 px inside each edge.
const TEXT_INSET_PX = 5 + 1;
// No glyph is two ems wide, so a text whose every line fits this bound cannot overflow.
const WIDEST_GLYPH_EM = 2;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericKeys(record: UnknownRecord): number[] {
  const keys: number[] = [];
  for (const key of Object.keys(record)) {
    if (/^\d+$/.test(key)) keys.push(Number(key));
  }
  return keys.sort((a, b) => a - b);
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function columnName(index: number): string {
  let remaining = index + 1;
  let name = "";
  while (remaining > 0) {
    const rest = (remaining - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

function parseRange(value: unknown): Range | null {
  if (typeof value !== "string") return null;
  const match = A1_RANGE.exec(value);
  if (!match) return null;
  const [, firstColumn, firstRow, secondColumn, secondRow] = match;
  const rowA = Number(firstRow) - 1;
  const rowB = Number(secondRow) - 1;
  const colA = columnIndex(firstColumn);
  const colB = columnIndex(secondColumn);
  return {
    rowStart: Math.min(rowA, rowB),
    rowEnd: Math.max(rowA, rowB),
    colStart: Math.min(colA, colB),
    colEnd: Math.max(colA, colB),
  };
}

function hasRange(ranges: Range[], row: number, col: number): boolean {
  for (const range of ranges) {
    if (
      row >= range.rowStart &&
      row <= range.rowEnd &&
      col >= range.colStart &&
      col <= range.colEnd
    ) {
      return true;
    }
  }
  return false;
}

function styleOf(styles: unknown[], cell: UnknownRecord): UnknownRecord | null {
  const index = cell.style;
  if (!isFiniteNumber(index)) return null;
  const style = styles[index];
  return isRecord(style) ? style : null;
}

function hasBorder(style: UnknownRecord | null): boolean {
  if (!style || !isRecord(style.border)) return false;
  const border = style.border;
  return Boolean(border.top || border.right || border.bottom || border.left);
}

function hasFill(style: UnknownRecord | null): boolean {
  return Boolean(style?.bgcolor);
}

function allowsRunOn(style: UnknownRecord | null): boolean {
  if (!style) return true;
  if (style.textwrap) return false;
  if (style.align !== undefined && style.align !== null && style.align !== "left") return false;
  if (hasBorder(style) || hasFill(style)) return false;
  const font = style.font;
  return !isRecord(font) || font.size === undefined || isFiniteNumber(font.size);
}

function fontOf(style: UnknownRecord | null): Font {
  const font = style && isRecord(style.font) ? style.font : null;
  const px = font && isFiniteNumber(font.size) ? Math.trunc(font.size) : DEFAULT_FONT_PX;
  const name = font && typeof font.name === "string" && font.name ? font.name : "Arial";
  const italic = font?.italic ? "italic " : "";
  const bold = font?.bold ? "bold " : "";
  return { css: `${italic}${bold}${px}px ${name}`, px };
}

function fitsWithoutMeasuring(text: string, px: number, width: number): boolean {
  return text
    .split("\n")
    .every((line) => TEXT_INSET_PX + [...line].length * WIDEST_GLYPH_EM * px <= width);
}

function longestLine(text: string): string {
  let longest = "";
  let count = 0;
  for (const line of text.split("\n")) {
    const length = [...line].length;
    if (length > count) {
      longest = line;
      count = length;
    }
  }
  return longest;
}

function isHiddenRow(row: UnknownRecord): boolean {
  return row.hidden === true || (isFiniteNumber(row.height) && row.height < 1);
}

function isHiddenColumn(cols: UnknownRecord, col: number): boolean {
  const entry = cols[col];
  return isRecord(entry) && isFiniteNumber(entry.width) && entry.width < 1;
}

function columnWidth(cols: UnknownRecord, col: number): number {
  const entry = cols[col];
  if (isRecord(entry) && isFiniteNumber(entry.width) && entry.width > 0) return entry.width;
  return DEFAULT_CELL_WIDTH;
}

function canTake(layout: Layout, cells: UnknownRecord, row: number, col: number): boolean {
  if (hasRange(layout.ranges, row, col)) return false;
  const cell = cells[col];
  if (!isRecord(cell)) return true;
  const text = cell.text;
  if (text !== undefined && text !== null && text !== "") return false;
  if (cell.merge) return false;
  const style = styleOf(layout.styles, cell);
  return !hasBorder(style) && !hasFill(style);
}

function cellsToTake(
  layout: Layout,
  cells: UnknownRecord,
  row: number,
  col: number,
  own: number,
  needed: number,
): number {
  let running = own;
  let taken = 0;
  for (let next = col + 1; running < needed; next += 1) {
    if (next >= layout.columnCount || !canTake(layout, cells, row, next)) break;
    running += columnWidth(layout.cols, next);
    taken += 1;
  }
  return taken;
}

function runOnCell(
  layout: Layout,
  cells: UnknownRecord,
  cell: UnknownRecord,
  row: number,
  col: number,
  contextOf: ContextOf,
): boolean {
  const text = cell.text;
  if (typeof text !== "string" || text === "" || text[0] === "=") return true;
  if (cell.merge || hasRange(layout.ranges, row, col)) return true;
  const style = styleOf(layout.styles, cell);
  if (!allowsRunOn(style) || isHiddenColumn(layout.cols, col)) return true;

  const own = columnWidth(layout.cols, col);
  const font = fontOf(style);
  if (fitsWithoutMeasuring(text, font.px, own)) return true;

  const context = contextOf();
  if (!context) return false;
  context.font = font.css;
  const needed = TEXT_INSET_PX + context.measureText(longestLine(text)).width;
  if (needed <= own) return true;

  const taken = cellsToTake(layout, cells, row, col, own, needed);
  if (taken < 1) return true;

  const merge: [number, number] = [0, taken];
  const range = `${columnName(col)}${row + 1}:${columnName(col + taken)}${row + 1}`;
  cell.merge = merge;
  layout.merges.push(range);
  layout.ranges.push({ rowStart: row, rowEnd: row, colStart: col, colEnd: col + taken });
  return true;
}

function runOnRow(
  layout: Layout,
  cells: UnknownRecord,
  row: number,
  contextOf: ContextOf,
): boolean {
  for (const col of numericKeys(cells)) {
    const cell = cells[col];
    if (!isRecord(cell)) continue;
    if (!runOnCell(layout, cells, cell, row, col, contextOf)) return false;
  }
  return true;
}

function runOnSheet(sheet: UnknownRecord, contextOf: ContextOf): boolean {
  const { rows, cols, merges, styles } = sheet;
  if (!isRecord(rows) || !isRecord(cols) || !Array.isArray(merges) || !Array.isArray(styles)) {
    return true;
  }
  const layout: Layout = {
    cols,
    styles,
    merges,
    ranges: merges.map(parseRange).filter((range): range is Range => range !== null),
    columnCount: isFiniteNumber(cols.len) ? Math.floor(cols.len) : 0,
  };
  for (const row of numericKeys(rows)) {
    const entry = rows[row];
    if (!isRecord(entry) || !isRecord(entry.cells) || isHiddenRow(entry)) continue;
    if (!runOnRow(layout, entry.cells, row, contextOf)) return false;
  }
  return true;
}

export function runOnTextOverflow(sheets: unknown, host: HTMLElement): void {
  if (!Array.isArray(sheets)) return;
  const made: { canvas?: HTMLCanvasElement } = {};
  let context: CanvasRenderingContext2D | null | undefined;
  // The fallback font for characters the named font lacks follows the canvas's
  // language, which a canvas takes from the page only while it is in it.
  const contextOf: ContextOf = () => {
    if (context === undefined) {
      try {
        const canvas = document.createElement("canvas");
        made.canvas = canvas;
        canvas.style.display = "none";
        host.appendChild(canvas);
        context = canvas.getContext("2d");
      } catch {
        context = null;
      }
    }
    return context ?? null;
  };
  try {
    for (const sheet of sheets) {
      if (!isRecord(sheet)) continue;
      if (!runOnSheet(sheet, contextOf)) return;
    }
  } finally {
    made.canvas?.remove();
  }
}
