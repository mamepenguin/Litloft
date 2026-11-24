# Addon proxy releases its DB connection before forwarding

Bug fix. No spec covered this; the correct behavior is stated here.

## What happened

Production, 2026-11-25. One video's scene list requested 200+ frames at once through
`GET /api/addons/intelligence/files/{id}/frame` (a `stream: true` route with a
`file_access` pre_check). The intelligence addon was slow to answer under load. Every one of
those requests held a pooled SQLAlchemy connection from the `file_access` pre_check until the
upstream answered, so the pool (size 20, overflow 40) ran dry
(`QueuePool limit of size 20 overflow 40 reached`). Every other core endpoint, `/health`
included, then waited for a connection and timed out. The backend had to be restarted.

## Correct behavior

1. While `addon_proxy` waits for, or streams from, an addon upstream, the request holds no
   pooled DB connection. The DB is used only for the pre-checks, and the connection is back
   in the pool before the upstream request is sent. This holds for buffered and `stream: true`
   routes alike.
2. Everything the pre-checks decide is unchanged: the same requests are rejected with the
   same status codes, and the same requests reach the upstream with the same method, path,
   query, body and headers.

## Out of scope

- A timeout for an upstream that never sends response headers on a stream route.
- Throttling how many frames the intelligence frontend requests at once (addon repository).
