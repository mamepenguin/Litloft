"use client";

import dynamic from "next/dynamic";

/**
 * Loaded the way the viewer itself is, and for the same reason.
 *
 * `lib/pdfDependencies.test.ts` keeps pdf.js out of anything the server
 * renders: it needs a canvas and a worker, and importing it statically here
 * would put the worker into the shell's bundle for every file kind, not just
 * PDFs. `FilePreview` already does exactly this for the viewer.
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
