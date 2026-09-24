# R-0 invariants: uniform answer for locked and unknown drives

1. Every media_import route that takes `X-Lit-Drive` answers a locked drive and a drive absent from drives.json with the same status (404) and the same body shape, `{"detail": "Drive not found: <the name the caller sent>"}`; no header, timing-independent field, or status tells them apart.
2. A drive the caller can access still works on every such route (no 404 for an accessible, configured drive).
3. A missing or empty `X-Lit-Drive` still answers 400.
4. A percent-encoded non-ASCII drive name is still decoded and accepted.
5. No route reaches the filesystem or the DB for a drive that is not in drives.json (an unknown drive never gets past the scope check into a handler body, e.g. no 500 from `get_drive_path` later in the handler).
