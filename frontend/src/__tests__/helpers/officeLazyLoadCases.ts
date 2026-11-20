import { OFFICE_PREVIEW_MAX_BYTES } from "@/lib/officeFiles";
import type { FileItem } from "@/types";

import {
  DOC_MIME,
  PPT_MIME,
  PPTX_MIME,
  XLS_MIME,
  XLSX_MIME,
  officeFile,
} from "./officeViewer";

/** Files whose page must not load either Office library: other Office formats, Office files the viewer refuses, and non-Office files. */
export function notTakenByTheViewer(): FileItem[] {
  return [
    officeFile({ id: "p1", filename: "deck.pptx", mime_type: PPTX_MIME }),
    officeFile({ id: "p2", filename: "old.doc", mime_type: DOC_MIME }),
    officeFile({ id: "p3", filename: "old.xls", mime_type: XLS_MIME }),
    officeFile({ id: "p4", filename: "old.ppt", mime_type: PPT_MIME }),
    officeFile({ id: "p5", file_size: OFFICE_PREVIEW_MAX_BYTES + 1 }),
    officeFile({
      id: "p6",
      filename: "plan.xlsx",
      mime_type: XLSX_MIME,
      file_size: OFFICE_PREVIEW_MAX_BYTES + 1,
    }),
    officeFile({ id: "p7", missing_since: "2026-02-01T00:00:00Z" }),
    officeFile({
      id: "p8",
      filename: "plan.xlsx",
      mime_type: XLSX_MIME,
      missing_since: "2026-02-01T00:00:00Z",
    }),
    officeFile({ id: "v1", filename: "clip.mp4", file_type: "video", mime_type: "video/mp4" }),
    officeFile({ id: "d1", filename: "doc.pdf", mime_type: "application/pdf" }),
  ];
}
