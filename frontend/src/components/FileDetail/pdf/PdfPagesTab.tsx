"use client";

import dynamic from "next/dynamic";

/**
 * pdf.js needs a canvas and a worker, so it must not reach the server, and a
 * static import here would put the worker into the shell's bundle for every
 * file kind rather than just PDFs.
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
