/**
 * `.doc` / `.xls` / `.ppt` are deliberately absent — `_extract_office_text`
 * (`backend/app/routers/files.py`) reads the OOXML formats with `python-docx`,
 * `openpyxl` and `python-pptx`, and returns "" for the older binary ones.
 */
import type { FileItem } from "@/types";

const WORD_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PRESENTATION_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const OFFICE_MIMES = new Set([
  WORD_MIME,
  EXCEL_MIME,
  PRESENTATION_MIME,
]);

/**
 * `/preview-text` opens the file every time — there is no cache — and
 * `openpyxl` in `read_only` mode still takes seconds on a large workbook. The
 * guard is on this side rather than in the backend because a cap there would
 * change the listing thumbnail's behaviour too, and a thumbnail that is
 * already on screen is a different trade from a detail page opening one.
 */
export const OFFICE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

export function wantsOfficeExcerpt(
  mimeType: string | null | undefined,
  fileSize: number,
): boolean {
  return OFFICE_MIMES.has(mimeType ?? "") && fileSize <= OFFICE_PREVIEW_MAX_BYTES;
}

/** Which browser viewer draws the file, or null when the page keeps its panel. */
export type OfficeViewer = "word" | "excel";

export function officeViewerFor(
  file: Pick<FileItem, "mime_type" | "file_size" | "missing_since">,
): OfficeViewer | null {
  if (file.missing_since) return null;
  if (file.file_size > OFFICE_PREVIEW_MAX_BYTES) return null;
  if (file.mime_type === WORD_MIME) return "word";
  if (file.mime_type === EXCEL_MIME) return "excel";
  return null;
}
