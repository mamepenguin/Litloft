/** A place the open document viewer can move to. */
export type DocumentLocation = { page: number } | { section: number };

export interface DocumentController {
  goTo(location: DocumentLocation): void;
}
