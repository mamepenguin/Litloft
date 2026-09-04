/**
 * Kept as the import path every host and test already uses. The
 * component itself is `FileDetail/FileDetailContainer`; this file is
 * the one-line redirect so splitting it into a directory did not turn
 * into an edit of every call site.
 */
export {
  FileDetailContainer as FileDetailContent,
  type FileDetailContentProps,
} from "./FileDetail/FileDetailContainer";
