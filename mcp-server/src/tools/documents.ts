import { z } from "zod";
import { runTool } from "./runTool.js";
import { intelligenceGet, withoutAvailable } from "./search.js";
import { readOnlyAnnotations, textResult, type LitloftTool } from "./types.js";

export const DOCUMENT_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/epub+zip",
]);

const readDocument: LitloftTool = {
  name: "read_document",
  description:
    "Read the text of a PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) or EPUB file, extracted from the file now, one unit at a time: a PDF page, a slide, a sheet (title = sheet name), an EPUB spine section (title = its table-of-contents title; numbered as search results' `section`), or the whole .docx. Pass start (unit number) and count (units; per format at most 10 pages, 200 slides, 50 sheets, 100 sections). A response stops at max_chars; when `next` is not null, call again with its start and offset to continue. A scanned page without a text layer has no text (a PDF page may read as just a `-----` rule). Errors: 404 also covers a file the intelligence addon has not indexed yet (just uploaded or moved; retry later); 429 means the reader is busy, retry as is; 502 usually means a PDF read was too slow, retry with a smaller count. For text/* and JSON files use get_file_content.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    file_id: z.string().min(1).describe("File id"),
    start: z.number().int().min(1).optional().describe("First unit to read, 1-based (default 1)"),
    count: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Units to read (default 5 pages, 50 slides, 5 sheets, 10 sections)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Characters to skip in the first unit, from `next` (default 0)"),
    max_chars: z
      .number()
      .int()
      .min(1)
      .max(200_000)
      .optional()
      .describe("Most characters of text to return (default 50000)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        withoutAvailable(
          await intelligenceGet(
            client,
            `/files/${encodeURIComponent(args.file_id as string)}/document-text`,
            args.drive as string,
            {
              start: args.start as number | undefined,
              count: args.count as number | undefined,
              offset: args.offset as number | undefined,
              max_chars: args.max_chars as number | undefined,
            }
          )
        )
      )
    ),
};

export const documentTools: LitloftTool[] = [readDocument];
