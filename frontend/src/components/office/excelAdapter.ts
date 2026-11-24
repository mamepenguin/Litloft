import "./excelContainment.css";

import { runOnTextOverflow } from "./excelRunOn";
import {
  releaseOfficeGrid,
  setOfficeGridActive,
  setOfficeGridFocusProbe,
} from "./officeGridActive";

interface SpreadsheetHandle {
  xs?: { sheet?: { reload?: () => void; focusing?: boolean } };
  observer?: MutationObserver | null;
}

interface SpreadsheetOptions {
  showContextmenu: boolean;
  beforeTransformData: (workbook: unknown) => unknown;
  transformData: (sheets: unknown) => unknown;
}

type UnknownRecord = Record<string, unknown>;

interface KeptColumns {
  worksheet: UnknownRecord;
  columns: unknown[] | null;
  widths: number[];
  defaultWidth: number;
}

const ROWS_TO_CREATE = 100;
const SIZE_SCALE = 4 / 3;
const ROW_DEFAULT_POINTS = 15;
const COLUMN_DEFAULT_PX = 64;
const COLUMN_UNIT_PX = 7;
const COLUMN_DIVISOR = 6;
// Text is stored at 16/9, not 4/3, because the library divides a size by 4/3
// before rounding it; 0.01 then keeps a whole pixel off its points-to-pixels table.
const TEXT_SCALE = 16 / 9;
const TEXT_SIZE_OFFSET = 0.01;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value: unknown): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

function pixels(value: unknown, perUnit: number): number | null {
  const units = positiveNumber(value);
  if (units === null) return null;
  const px = Math.round(units * perUnit);
  return px > 0 ? px : null;
}

function scaleMember(target: UnknownRecord, key: string, factor: number): void {
  const value = target[key];
  if (isFiniteNumber(value)) target[key] = value * factor;
}

function scaleFont(font: unknown, scaled: Set<object>): void {
  if (!isRecord(font) || scaled.has(font)) return;
  const size = font.size;
  if (!isFiniteNumber(size)) return;
  scaled.add(font);
  font.size = size * TEXT_SCALE;
}

function scaleRow(row: unknown, defaultHeight: unknown, fonts: Set<object>): void {
  if (!isRecord(row)) return;
  const points = positiveNumber(row.height) ?? positiveNumber(defaultHeight) ?? ROW_DEFAULT_POINTS;
  row.height = points * SIZE_SCALE;
  if (typeof row.eachCell !== "function") return;
  row.eachCell((cell: unknown) => {
    if (!isRecord(cell) || !isRecord(cell.style)) return;
    scaleFont(cell.style.font, fonts);
  });
}

function scaleRows(worksheet: UnknownRecord, defaultHeight: unknown, fonts: Set<object>): number {
  let widest = 0;
  const visit = (row: unknown) => {
    scaleRow(row, defaultHeight, fonts);
    if (isRecord(row) && isFiniteNumber(row.cellCount) && row.cellCount > widest) {
      widest = row.cellCount;
    }
  };
  if (typeof worksheet.getRow === "function") {
    for (let i = 1; i <= ROWS_TO_CREATE; i += 1) visit(worksheet.getRow(i));
  }
  // The grid draws rows 1 to 100 even when the sheet has none, so those are
  // created; past 100 only existing rows are reached, so a stray cell far down adds none.
  if (typeof worksheet.findRow === "function") {
    const rowCount = isFiniteNumber(worksheet.rowCount) ? Math.floor(worksheet.rowCount) : 0;
    for (let i = ROWS_TO_CREATE + 1; i <= rowCount; i += 1) visit(worksheet.findRow(i));
  }
  return widest;
}

function columnPixels(column: UnknownRecord, defaultWidth: unknown): number {
  return (
    pixels(column.width, COLUMN_UNIT_PX) ??
    pixels(defaultWidth, COLUMN_UNIT_PX) ??
    COLUMN_DEFAULT_PX
  );
}

function scaleColumn(
  column: unknown,
  defaultWidth: unknown,
  scaled: Set<object>,
  pixelsOf: WeakMap<object, number>,
): void {
  if (!isRecord(column) || scaled.has(column)) return;
  scaled.add(column);
  const px = columnPixels(column, defaultWidth);
  pixelsOf.set(column, column.hidden ? 0.1 : px);
  column.width = px / COLUMN_DIVISOR;
}

function scaleColumns(
  worksheet: UnknownRecord,
  widest: number,
  defaultWidth: unknown,
  scaled: Set<object>,
  pixelsOf: WeakMap<object, number>,
): void {
  if (typeof worksheet.getColumn !== "function") return;
  for (let i = 1; i <= widest; i += 1) {
    scaleColumn(worksheet.getColumn(i), defaultWidth, scaled, pixelsOf);
  }
}

function keepColumns(
  worksheet: UnknownRecord,
  defaultWidth: unknown,
  scaled: Set<object>,
  pixelsOf: WeakMap<object, number>,
): KeptColumns {
  const columns = Array.isArray(worksheet.columns) ? worksheet.columns : null;
  const fallback = pixels(defaultWidth, COLUMN_UNIT_PX) ?? COLUMN_DEFAULT_PX;
  const widths = (columns ?? []).map((column) => {
    scaleColumn(column, defaultWidth, scaled, pixelsOf);
    return isRecord(column) ? (pixelsOf.get(column) ?? fallback) : fallback;
  });
  return { worksheet, columns, widths, defaultWidth: fallback };
}

function scalePictures(worksheet: UnknownRecord, scaled: Set<object>): void {
  if (typeof worksheet.getImages !== "function") return;
  const images = worksheet.getImages();
  if (!Array.isArray(images)) return;
  for (const image of images) {
    if (!isRecord(image)) continue;
    const range = image.range;
    if (!isRecord(range) || scaled.has(range)) continue;
    scaled.add(range);
    if (isRecord(range.tl)) {
      scaleMember(range.tl, "nativeColOff", SIZE_SCALE);
      scaleMember(range.tl, "nativeRowOff", SIZE_SCALE);
    }
    if (isRecord(range.br)) {
      scaleMember(range.br, "nativeColOff", SIZE_SCALE);
      scaleMember(range.br, "nativeRowOff", SIZE_SCALE);
    }
    if (isRecord(range.ext)) {
      scaleMember(range.ext, "width", SIZE_SCALE);
      scaleMember(range.ext, "height", SIZE_SCALE);
    }
  }
}

function scaleWorksheet(
  worksheet: unknown,
  fonts: Set<object>,
  pictures: Set<object>,
  scaledColumns: Set<object>,
  columnPixelsOf: WeakMap<object, number>,
): KeptColumns | null {
  if (!isRecord(worksheet)) return null;
  const properties = worksheet.properties;
  const sheetProperties = isRecord(properties) ? properties : {};
  const widest = scaleRows(worksheet, sheetProperties.defaultRowHeight, fonts);
  let kept: KeptColumns | null = null;
  if (typeof worksheet.getColumn === "function") {
    scaleColumns(worksheet, widest, sheetProperties.defaultColWidth, scaledColumns, columnPixelsOf);
    kept = keepColumns(worksheet, sheetProperties.defaultColWidth, scaledColumns, columnPixelsOf);
  }
  scalePictures(worksheet, pictures);
  return kept;
}

function scaleTextOffset(sheet: UnknownRecord, scaled: Set<object>): void {
  const styles: unknown[] = Array.isArray(sheet.styles) ? sheet.styles : [];
  for (const style of styles) {
    if (!isRecord(style)) continue;
    const font = style.font;
    if (!isRecord(font) || scaled.has(font)) continue;
    const size = font.size;
    if (!isFiniteNumber(size)) continue;
    scaled.add(font);
    font.size = size + TEXT_SIZE_OFFSET;
  }
}

function applyColumns(sheet: UnknownRecord, kept: KeptColumns): void {
  const cols = sheet.cols;
  if (isRecord(cols)) {
    const length = isFiniteNumber(cols.len) ? Math.floor(cols.len) : 0;
    for (let k = 0; k < length; k += 1) {
      if (k in cols) continue;
      const px = k < kept.widths.length ? kept.widths[k] : kept.defaultWidth;
      cols[k] = { width: px };
    }
  }
  // The picture code counts a column with no object as 80 px; putting back the
  // array the library trimmed makes it read the widths the grid draws.
  kept.worksheet._columns = kept.columns;
}

function createSheetSizing(host: HTMLElement): {
  beforeTransformData: (workbook: unknown) => unknown;
  transformData: (sheets: unknown) => unknown;
} {
  const records: (KeptColumns | null)[] = [];

  const beforeTransformData = (workbook: unknown): unknown => {
    const fonts = new Set<object>();
    const pictures = new Set<object>();
    const columns = new Set<object>();
    const columnPixels = new WeakMap<object, number>();
    try {
      if (!isRecord(workbook) || typeof workbook.eachSheet !== "function") return workbook;
      workbook.eachSheet((worksheet: unknown) => {
        let kept: KeptColumns | null = null;
        try {
          kept = scaleWorksheet(worksheet, fonts, pictures, columns, columnPixels);
        } catch {}
        records.push(kept);
      });
    } catch {}
    return workbook;
  };

  const transformData = (sheets: unknown): unknown => {
    const scaled = new Set<object>();
    try {
      if (!Array.isArray(sheets)) return sheets;
      for (let i = 0; i < sheets.length; i += 1) {
        const sheet = sheets[i];
        if (!isRecord(sheet)) continue;
        scaleTextOffset(sheet, scaled);
        const kept = records[i];
        if (kept) applyColumns(sheet, kept);
      }
    } catch {}
    try {
      runOnTextOverflow(sheets, host);
    } catch {}
    return sheets;
  };

  return { beforeTransformData, transformData };
}

export async function drawExcel(
  container: HTMLElement,
  frame: HTMLElement,
  bytes: ArrayBuffer,
): Promise<() => void> {
  await import("@js-preview/excel/lib/index.css");
  const { default: previewExcel } = await import("@js-preview/excel");
  const sizing = createSheetSizing(container);
  const options: SpreadsheetOptions = {
    showContextmenu: false,
    beforeTransformData: sizing.beforeTransformData,
    transformData: sizing.transformData,
  };
  const instance = previewExcel.init(container, options);
  const spreadsheet = instance as unknown as SpreadsheetHandle;

  // x-data-spreadsheet's window handlers act on every key, paste and copy
  // while its private `focusing` flag is set, and only a real click outside
  // the grid clears it. Clearing it here keeps them off the rest of the page.
  const releaseGridFocus = () => {
    const sheet = spreadsheet.xs?.sheet;
    if (sheet) sheet.focusing = false;
  };

  // The library's own observer makes the grid's inputs read-only and then
  // blurs `document.activeElement` wherever it is, 200 ms after any change in
  // the grid, so a resize would take focus from a field outside it. This one
  // does the same job and blurs only an element inside the grid.
  spreadsheet.observer?.disconnect();
  let lockQueued = false;
  const lockInputs = () => {
    lockQueued = false;
    for (const input of container.querySelectorAll("input")) {
      input.readOnly = true;
    }
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && container.contains(focused)) {
      focused.blur();
    }
  };
  const inputLock = new MutationObserver(() => {
    if (lockQueued) return;
    lockQueued = true;
    requestAnimationFrame(lockInputs);
  });
  inputLock.observe(container, { attributes: true, childList: true, subtree: true });
  lockInputs();

  let active = false;
  let drawn = false;
  let disposed = false;

  const onClickInside = () => {
    active = true;
    setOfficeGridActive(true);
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!active) return;
    if (event.target instanceof Node && frame.contains(event.target)) return;
    active = false;
    setOfficeGridActive(false);
    releaseGridFocus();
  };
  container.addEventListener("click", onClickInside);
  document.addEventListener("focusin", onFocusIn);
  const focusProbe = () => spreadsheet.xs?.sheet?.focusing === true;
  if (spreadsheet.xs) setOfficeGridFocusProbe(focusProbe);

  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (drawn) spreadsheet.xs?.sheet?.reload?.();
        });
  observer?.observe(frame);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    inputLock.disconnect();
    container.removeEventListener("click", onClickInside);
    document.removeEventListener("focusin", onFocusIn);
    releaseOfficeGrid(focusProbe, active);
    active = false;
    releaseGridFocus();
    try {
      instance.destroy();
    } catch {
      // The library throws when its wrapper has already left the container.
    }
  };

  try {
    await instance.preview(bytes);
  } catch (error) {
    dispose();
    throw error;
  }
  drawn = true;
  spreadsheet.xs?.sheet?.reload?.();
  return dispose;
}
