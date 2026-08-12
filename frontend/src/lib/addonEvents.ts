/**
 * Browser-level addon → core UI event contracts.
 *
 * Keep these names centralized: addon frontend sources are compiled into the
 * host frontend and must import the same literal their core consumer uses.
 */
export const FILE_CHAPTERS_UPDATED_EVENT = "litloft:chapters-updated";

export interface FileChaptersUpdatedDetail {
  fileId: string;
}
