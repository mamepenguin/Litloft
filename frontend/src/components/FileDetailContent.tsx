import {
  FileDetailContainer,
  type FileDetailContentProps,
} from "./FileDetail/FileDetailContainer";

export type { FileDetailContentProps };

/**
 * One mount per file. The view starts from a list's copy of the file, so a
 * mount kept across a change of file would carry the previous file's
 * player and state under the next file's id.
 */
export function FileDetailContent(props: FileDetailContentProps) {
  return <FileDetailContainer key={props.fileId} {...props} />;
}
