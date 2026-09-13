import type { FileKind, TrustFilter } from "@/types";

export const TRUST_OPTION_KEYS: ReadonlyArray<{ value: TrustFilter | null; labelKey: string }> = [
  { value: null, labelKey: "filterAll" },
  { value: "verified", labelKey: "filterVerified" },
  { value: "unreviewed", labelKey: "filterUnreviewed" },
];

/**
 * Markdown and PDF sit under `document`: choosing `document` returns
 * them too, and choosing one of them narrows further.
 */
export const TYPE_OPTION_KEYS: ReadonlyArray<{ value: FileKind | null; labelKey: string }> = [
  { value: null, labelKey: "type.all" },
  { value: "video", labelKey: "type.video" },
  { value: "image", labelKey: "type.image" },
  { value: "audio", labelKey: "type.audio" },
  { value: "document", labelKey: "type.document" },
  { value: "markdown", labelKey: "type.markdown" },
  { value: "pdf", labelKey: "type.pdf" },
  { value: "archive", labelKey: "type.archive" },
  { value: "other", labelKey: "type.other" },
];

