"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getPreviewTextUrl } from "@/lib/api";
import { wantsOfficeExcerpt } from "@/lib/officeFiles";

/**
 * Not a viewer, and deliberately not one: no scrolling, no page turning, no
 * fetching more.
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
  missing?: boolean;
}) {
  const t = useTranslations("file");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    // Cleared first, unconditionally. This mount is reused when the reader
    // moves between files, and an excerpt left standing is the previous
    // document's text under this document's name.
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
