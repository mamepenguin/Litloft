import type { FileKind, TrustFilter } from "@/types";

/**
 * The vocabularies the folder toolbar's filter offers, in the order it
 * offers them.
 *
 * Here rather than in `FolderToolbar` because `FilterMenu` draws both and
 * `searchTypeVocabulary.test.ts` compares the kind list against what the
 * search index can answer — three readers, none of which should have to
 * import a toolbar to learn what a kind is.
 */
export const TRUST_OPTION_KEYS: ReadonlyArray<{ value: TrustFilter | null; labelKey: string }> = [
  { value: null, labelKey: "filterAll" },
  { value: "verified", labelKey: "filterVerified" },
  { value: "unreviewed", labelKey: "filterUnreviewed" },
];

/**
 * The one vocabulary, read from the one place it is written
 * (`filter.type.*`). The toolbar used to carry its own copy of these
 * words under `toolbar.*`, forty pixels from a chip that offered four
 * different ones.
 *
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

