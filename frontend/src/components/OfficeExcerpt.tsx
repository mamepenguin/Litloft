"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getPreviewTextUrl } from "@/lib/api";
import { wantsOfficeExcerpt } from "@/lib/officeFiles";

/**
 * The first few lines of an Office file, under the "no preview" panel.
 *
 * Not a viewer, and deliberately not one: no scrolling, no page turning, no
 * fetching more. The detail page for a DOCX or an XLSX says the format cannot
 * be displayed and offers a download, which leaves nothing on screen to
 * remind the reader *which* document this is — and the backend has been
 * extracting exactly that text for the listing thumbnail and for search since
 * before this page existed. Ten lines answer "is this the 2019 return or the
 * 2020 one" without opening anything.
 *
 * Nothing is drawn when the extraction comes back empty, which is the same
 * rule the rest of the redesign follows: a section that would only announce
 * that it has nothing is not a section.
 */
export function OfficeExcerpt({
  fileId,
  mimeType,
  fileSize,
  missing = false,
}: {
  fileId: string;
  mimeType: string | null | undefined;
  fileSize: number;
  /** A file the scanner can no longer find. Streaming it answers 410. */
  missing?: boolean;
}) {
  const t = useTranslations("file");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    // Cleared first, unconditionally. This mount is reused when the reader
    // moves between files, and an excerpt left standing while the next one is
    // in flight — or after it fails — is the previous document's text under
    // this document's name.
    setText(null);
    if (missing || !wantsOfficeExcerpt(mimeType, fileSize)) return;

    // Aborted on the way out: the extraction is the expensive thing the 20 MB
    // guard exists to bound, and leaving it running after the reader has
    // moved on spends exactly what the guard was protecting.
    const controller = new AbortController();
    fetch(getPreviewTextUrl(fileId), {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.text() : ""))
      .then((raw) => setText(raw.trim() || null))
      // A failed extraction leaves the panel above exactly as it was. There
      // is nothing to say about it: the reader was not promised this.
      .catch(() => {});
    return () => controller.abort();
  }, [fileId, mimeType, fileSize, missing]);

  if (text === null) return null;

  return (
    <section
      data-testid="office-excerpt"
      className="border-t border-bg-border px-6 py-4"
      aria-label={t("officeExcerpt")}
    >
      <p className="line-clamp-10 whitespace-pre-line text-sm leading-relaxed text-text-muted">
        {text}
      </p>
    </section>
  );
}
