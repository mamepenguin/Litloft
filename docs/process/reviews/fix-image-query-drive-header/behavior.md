# Correct behavior: image search on a drive whose name is not Latin-1

The behavior is SPEC-CORE-046 (`docs/specs/image-query-search.md`, normal flow step 0
and step 8): image search is available for a drive exactly when
`GET /api/addons/intelligence/search/by-image/available`, sent with `X-Lit-Drive`,
answers 200 with a body that is not `{available: false}`, and the search itself is a
`POST /api/addons/intelligence/search/by-image` carrying `X-Lit-Drive`. In tests, cite
it as `SPEC-CORE-046`.

## Behavior

- For every drive name, including names outside ISO-8859-1 such as `動画` or
  `テスト画像`, both requests are sent, and each carries `X-Lit-Drive` set to the drive
  name percent-encoded with `encodeURIComponent`, the encoding every other sender of the
  header uses and the addon proxy decodes.
- A drive whose availability request answers 200 `{}` therefore offers image search,
  whatever its name; today a non-Latin-1 name makes `fetch` throw before any request
  leaves, and the drive reads as unavailable (「このドライブでは画像で探せません」).
- An ASCII drive name is sent unchanged by that encoding, so nothing changes for it.

## Scope

`frontend/src/lib/imageQuery.ts`: `askImageAvailability` and `requestImageAnswer`.
Every other sender of `X-Lit-Drive` in core and in the addons already encodes.
