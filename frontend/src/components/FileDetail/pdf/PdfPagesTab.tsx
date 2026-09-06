"use client";

import dynamic from "next/dynamic";

/**
 * Loaded the way the viewer itself is, and for the same reason.
 *
 * pdf.js needs a canvas and a worker, so it must not reach the server, and a
 * static import here would put the worker into the shell's bundle for every
 * file kind rather than just PDFs. `FilePreview` loads the viewer the same
 * way and records the server-render failure that taught it.
 */
export const PdfPagesTab = dynamic(
  () => import("./PdfPagesPanel").then((m) => m.PdfPagesTab),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-xl bg-bg-card" aria-hidden="true" />
    ),
  },
);
