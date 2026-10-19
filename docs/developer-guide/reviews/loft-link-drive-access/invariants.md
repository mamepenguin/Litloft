# R-0 invariants: media_import loft metadata/refresh drive check

1. GET /link/{id}/metadata returns 404 (never 200, never 403) when the file's drive is locked for the caller; the body carries no metadata.
2. POST /link/{id}/refresh returns 404 and enqueues nothing when the file's drive is locked for the caller.
3. Both endpoints return 404 and enqueue nothing when the file exists but is on a drive other than X-Lit-Drive, even if the caller can access both drives.
4. Both endpoints return 400 when X-Lit-Drive is absent or empty, and 404 when it names an unknown drive.
5. Both endpoints return 404 for a trashed (deleted_at set) or missing (missing_since set) file.
6. An active .loft on an accessible, matching drive still returns its metadata (200) and refresh still enqueues (file_id, url, drive).
7. LoftMetadataPanel sends X-Lit-Drive (percent-encoded) on both calls, so the panel still loads for a drive with a non-ASCII name.
