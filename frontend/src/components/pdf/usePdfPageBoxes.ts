"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type { PageBox } from "@/lib/pdfZoomMode";

/** Pages on either side of the one in view whose size is fetched ahead. */
const LOOKAROUND = 3;

/**
 * Page sizes in PDF points, keyed by 1-based page number. Only the pages near
 * `around` are asked for, so a thousand-page document costs a handful of
 * `getPage` calls, not a thousand.
 */
export function usePdfPageBoxes(
  pdf: PDFDocumentProxy | null,
  around: number,
): ReadonlyMap<number, PageBox> {
  const [boxes, setBoxes] = useState<{
    pdf: PDFDocumentProxy | null;
    map: ReadonlyMap<number, PageBox>;
  }>({ pdf: null, map: new Map() });

  const current = boxes.pdf === pdf ? boxes.map : new Map<number, PageBox>();

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const wanted: number[] = [];
    for (let n = around - LOOKAROUND; n <= around + LOOKAROUND; n++) {
      if (n >= 1 && n <= pdf.numPages && !current.has(n)) wanted.push(n);
    }
    if (wanted.length === 0) return;
    Promise.all(
      wanted.map(async (n) => {
        try {
          const page = await pdf.getPage(n);
          const view = page.getViewport({ scale: 1 });
          return [n, { width: view.width, height: view.height }] as const;
        } catch {
          // A page that cannot be read stays unknown, and an unknown page is
          // shown alone rather than guessed at.
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setBoxes((prev) => {
        const map = new Map(prev.pdf === pdf ? prev.map : []);
        for (const r of results) if (r) map.set(r[0], r[1]);
        return { pdf, map };
      });
    });
    return () => {
      cancelled = true;
    };
    // `current` is derived from `boxes`, which this effect writes: listing it
    // would re-run the fetch for the pages it has just stored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, around]);

  return current;
}
