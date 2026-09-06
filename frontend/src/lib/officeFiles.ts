/**
 * The three Office formats the backend can extract text from.
 *
 * One definition, because two consumers read it for the same purpose — the
 * listing thumbnail and the detail page's excerpt both ask "does
 * `/preview-text` have anything to say about this file". A second copy would
 * not fail anywhere: both would keep working, and the only symptom would be a
 * format that has a thumbnail and no excerpt.
 *
 * `.doc` / `.xls` / `.ppt` are deliberately absent — `_extract_office_text`
 * (`backend/app/routers/files.py`) reads the OOXML formats with `python-docx`,
 * `openpyxl` and `python-pptx`, and returns "" for the older binary ones.
 */
export const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/**
 * Above this, do not ask for an excerpt.
 *
 * `/preview-text` opens the file every time — there is no cache — and
 * `openpyxl` in `read_only` mode still takes seconds on a large workbook. The
 * guard is on this side rather than in the backend because a cap there would
 * change the listing thumbnail's behaviour too, and a thumbnail that is
 * already on screen is a different trade from a detail page opening one.
 */
export const OFFICE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

/** Is an excerpt worth asking for? */
export function wantsOfficeExcerpt(
  mimeType: string | null | undefined,
  fileSize: number,
): boolean {
  return OFFICE_MIMES.has(mimeType ?? "") && fileSize <= OFFICE_PREVIEW_MAX_BYTES;
}
