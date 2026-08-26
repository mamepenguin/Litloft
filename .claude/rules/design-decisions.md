# Design rules

Invariant rules to follow whenever you edit code. Read these as a "this is how we will keep doing it" declaration, not as a record of past circumstances. General naming conventions and patterns live in `backend-conventions.md` / `frontend-conventions.md`.

## Access control

- When a protected drive is locked, exclude it from API responses entirely. Return 404 (not 403) so its existence stays hidden.
- The root drive picker may link to `/unlock` as a generic access action. Do not list locked drive names, counts, thumbnails, or group names before unlock.
- When `passwords.json` is absent **or empty `[]`**, every drive is public (graceful degradation — `auth.load_passwords()` treats absent and `[]` identically). Do not raise errors.
- `configure.py` always generates `passwords.json` as an empty `[]` (single-file bind-mount footgun guard, symmetric with `drives.json`) and writes an **unconditional read-write** mount `./passwords.json:/app/passwords.json` into the backend volumes of `docker-compose.override.yml`. **`:ro` is forbidden** — the GUI (`/setup`, `/admin/settings` PasswordsSection) writes this file in place and `:ro` causes EBUSY / write rejection. Do not edit `docker-compose.yml`.

## Drives

- **A drive is a security boundary.** Do not build cross-drive features such as cross-drive search, favorites, or tag aggregation.
- **Drive-partitioned tables are uniquely keyed per-drive, never globally.** `File` (`UniqueConstraint("drive", "file_path")`), `Tag`, `EmptyFolder`, `PinnedFolder`, `Collection` all use a composite `UniqueConstraint("drive", ...)`. `file_path` is stored drive-relative with no drive prefix, so two drives legitimately each hold e.g. a root `README.md`. Any query/upsert on these tables must be drive-scoped (`File.drive == drive AND ...`); never query `File.file_path` alone (the global single-column UNIQUE was a `videos`-era design bug, fixed 2026-05-17).
- Special views like favorites are expressed via the `?view=<name>` query (to avoid clashing with folder names).
- Drive configuration lives in `drives.json` (outside the DB). Changes take effect on container restart.

## File state (Active / Missing / Trash)

The three states are encoded in two columns, `deleted_at` and `missing_since`, which are mutually exclusive:

| State | `deleted_at` | `missing_since` | Auto-purge |
|---|---|---|---|
| Active | NULL | NULL | - |
| Missing | NULL | SET | none |
| Trash | SET | NULL | 30 days |

- File-listing queries must always go through `app.models.active_file_filter()`. Do not write `deleted_at.is_(None)` directly.
- `restore_file()` clears both `deleted_at` and `missing_since` (a safety net for out-of-band edits and future bugs).
- The scanner skips soft-deleted files (does not flip them to missing).

## Handling missing files

Treat the DB not as an FS cache, but as an independent source of truth that holds data which cannot be regenerated from the filesystem (watch history, comments, tags, transcripts, embeddings).

- An active file that is no longer present on the FS is not deleted; set `missing_since = now` and emit `files.missing`.
- When the same path reappears, set `missing_since = NULL` and emit `files.recovered`.
- If `drive_path.exists() == False`, the scanner returns early (so a mount failure does not flip every file to missing).
- An upload to the same path revives the missing record (do not INSERT a new row; this avoids the UNIQUE constraint).
- For missing files: stream returns 410 Gone, GET and mutating endpoints return 404, only thumbnails can still be served.
- `files.purged` is emitted only on an explicit user-driven hard delete. The scanner never emits it.
- Keep thumbnails for missing files (they are reused on recovery).
- Missing files are not auto-purged. They are kept indefinitely until the user explicitly deletes them.
- `purge_all_missing` commits in chunks of 200, then emits a single `files.purged` carrying every purged id after the loop (the startup auto-purge does the same with 100-row chunks). One event per run, not per batch.

## Trash

- Moving to trash does not touch the FS. Physical deletion happens only on purge.
- Auto-purge runs at startup and every 24 h, removing items older than 30 days.

## Playlists

- Reject adding missing/trash files (apply `active_file_filter()`).
- Missing/trash files already in a playlist remain in the response; the frontend adjusts the rendering based on state.

## Tag editing

The canonical store depends on the file extension:

- **`.md`**: `frontmatter.tags` is canonical. `File.tags` is a projection cache.
- **non-`.md`**: `File.tags` is canonical.

Rules:

- The frontend must always save through `saveFileTags(file, tags)`. The mime_type / extension branching lives inside that function; the UI layer must not decide.
- For `.md`, rewrite the frontmatter via `PUT /api/files/{id}/content`; the core syncs `File.tags` as a projection inside the same handler.
- The content write and the tag projection commit separately. If the projection fails, the content write must still be durable.
- Content PUTs from chip editing are coalesced with a 500 ms debounce (2 s is too long; under 100 ms is wasteful).
- Auto_tags Approve also goes through `saveFileTags`. Retry on `ConflictError` exactly once.
- The frontmatter parser exists as two independent implementations — `backend/app/services/frontmatter.py` and `addons/knowledge/app/services/frontmatter.py` — because they live in different containers and cannot share code. Drift is caught in PR review.
- `POST /api/internal/files/{id}/tags` (gated by `CORE_INTERNAL_SECRET`) is exclusively for the knowledge scanner. The frontend must not call it.

## File relations

- `file_relations` (static relations with a `kind`, queryable via bidirectional OR) is a core table. It is premised on the core UI displaying and configuring it (`.claude/rules/internal-api-policy.md` R1/R4).
- The set of valid `kind` values is enforced at the application layer, not by a DB constraint (so addons can extend it).
- Both ends of a relation must be in the same drive. Violations return 400.
- The FK to `files.id` is `ON DELETE CASCADE`.
- The "active summary" pointer (`file_active_summaries`) lives **inside the knowledge addon**. It does not live in core (spec `2026-04-30-file-active-summary-to-knowledge`; would violate Internal API policy R1/R3).

## Watch history and profiles

- Keep the JWT (drive access control, cookie `access_token`) and the viewer-identity cookie (`lit_viewer`, or the `X-Lit-Viewer` header for non-browser clients) orthogonal. Do not mix them.
- The nickname is hashed with SHA-256 → viewer_id. There is no account management.
- When no profile is set, fall back to localStorage and do not persist server-side (return 204).
- Do not build a profile-listing API (privacy).
- `WatchHistory` covers both "view history" (file-detail page open) and "playback progress" (player position/duration):
  - On opening the file-detail page, POST an empty body to `/api/files/{file_id}/progress` to update `last_played_at`. This applies regardless of media type (text / markdown / image / PDF included).
  - For media files, after the player starts, re-POST with position/duration to update playback markers.
  - Both paths always refresh `last_played_at`. A view-only POST never overwrites the playback markers of media.
  - View-only records with `playback_position=0` / `duration=0` are filtered out naturally by the continue-watching gate (the 90% completion gate in `drives.py`).
- **Reaching the end of a media file records the final position; it never deletes the record.** Players write `position = currentTime`, `duration = duration` on `ended`, and the 90% gate keeps the row out of continue-watching. Deleting the row is reserved for an explicit user action ("remove from history"). Do not call `deleteWatchProgress` / `clearProgress` from a playback-completion path — that erases the distinction between "watched to the end" and "never opened".
  - When the duration is not a finite positive number (live streams, media that never probed its length), write nothing and let the last periodic save stand. Never fabricate a completed state.
  - Providers that cannot observe completion (plain iframe embeds) simply omit `LoftEmbedProps.onEnded`; absence means "unknown", not "unfinished".
  - This table is the single source of truth for syncing watch history across clients; `personal_history` (intelligence Ask) reads it as canonical.

## WebSocket

- The backend is not externally exposed. WS is also proxied through the Next.js Custom Server.
- Connections are accepted even when unauthenticated (so a fully public mode works); only protected-drive notifications are filtered.
- WS broadcasts from the scanner are bridged with `run_in_executor` → `call_soon_threadsafe`.

## Addons: scope and policy

Capability scope and per-drive policy are split into two layers:

- **Capability scope**: `"drive" | "global" | "both"` declared in `ADDON_META` / `manifest.json`. An undeclared scope is a load error and the addon is skipped (do not infer it).
- **Policy**: `drives.json.addons.<name>` (a bool, or `{feature: bool}`). The core treats it as a generic dictionary; it does not interpret addon names or feature names.
- Unspecified keys are enabled by graceful degradation.

Rules:

- Defense for policy-off data is two layers: pre_check in the host proxy (returns 404) plus `is_feature_enabled` in the addon worker (turns into a no-op).
- Filtering of event-hooks is fail-open (forward on lookup failure; the addon-side WHERE provides the second layer).
- When an addon starts up, run `purge_drive` on existing data for policy-off drives. If the policy lookup fails, skip the purge to avoid accidental deletion.
- Reflecting `drives.json` requires a process restart. The `policy_client` on the intelligence side caches with TTL 30 s + fail-open.

## Addons: drive-scope context propagation

- The URL is `/drive/{drive}/addons/{name}`, but the API is `/api/addons/{name}/...`.
- The frontend attaches the `X-Lit-Drive` header.
- The core's addon_proxy makes it required when scope=drive, validates against `accessible_drives`, and forwards upstream.
- The addon side just reads the header. It does not validate.
- `drive_optional` is restricted to inherently global paths (`<img>`, admin queue, etc.). Authorization for those paths is enforced through a separate route.

## Addons: implementation discipline

- **No core-to-addon dependencies.** Do not add addon-specific code to the core.
- Addon-to-core is fine (an addon may use `app.config`, `app.database`, `app.models`, `app.services.ws`, etc.).
- Addons must not hard-code caller authentication to cookies. Independent-service addons accept caller credentials through a frozen `CallerCredential` value that preserves either the inbound `Cookie` header or `Authorization: Bearer` token, then forwards the same shape when calling core public APIs. The duplicated `app/credentials.py` implementations in addons are intentionally kept in sync by PR review, like the duplicated `frontmatter.py` parsers.
- The UI is injected through slots (`search-modes`, `file-detail-sections`, `dashboard-widgets`, `folder-actions`, etc.). When no addon is installed, the slot is hidden (no holes in the UI).
- An addon's UI lives under `addons/{name}/frontend/`. If `Page.tsx` exists, the `/addons/{name}` route is auto-generated (do not write a manual wrapper).
- In-process addon enable/disable is controlled by adding/removing a symlink. Do not modify core code.
- Independent-service addons are added via `docker-compose.override.yml`. Do not modify the core's `docker-compose.yml`. The core DB is mounted read-only (`:ro`).
- **Mount the core's data as a directory (`./data:/data:ro`), never the DB file on its own.** SQLite runs the core DB in WAL mode, so a reader needs `data.db-wal` / `data.db-shm` beside `data.db`, and SQLite deletes both on clean shutdown. A per-file bind mount of a path that does not exist makes Docker create a **directory** there, after which the backend cannot open its own database (`unable to open database file`) and the whole stack fails to start. The addon is told where the DB is with `HOMEVAULT_DB_PATH=/data/data.db` rather than renaming it in the mount.
- **That directory mount must be paired with `- /dev/null:/data/.jwt_secret:ro`.** `data/.jwt_secret` is the core's token signing key and lives beside the DB; an addon that can read it can mint a token for any drive group (or `__admin__`) and call core write APIs, defeating the read-only drive mounts. `/dev/null` is the mask because it always exists on the host and so cannot itself become a Docker-created directory.
- **The mask makes `depends_on: backend: condition: service_healthy` load-bearing for startup.** A bind mount needs an existing target, and on a first run `data/.jwt_secret` appears only when the backend boots (`init_jwt_secret()` in the startup lifespan, before `/health` answers). Without the gate, container creation fails outright with `openat .jwt_secret: read-only file system`. Any service taking the data mount keeps the healthy gate.
- The residual exposure — other addons' DBs under `data/addons/`, plus `data/uploads` — is an accepted trade under the personal-tool premise where every addon is first-party. Scoping it tighter means giving the DB its own subdirectory, which breaks every existing `docker-compose.override.yml` on upgrade. A third-party addon gets the Internal API, not this mount.
- All three invariants are enforced in `tests/test_configure.py`, against `configure.py`, `docker-compose.override.yml.example`, and every published recipe under `docs/`.

## Internal API

- `routers/internal.py` is for the Docker-internal network only.
- Normal state/meta endpoints do not require a secret.
- `GET /api/internal/files/{id}/content` is the exception: a layered defense of text-mime allowlist (`_CONTENT_READ_ALLOWED_MIMES`) + `CORE_INTERNAL_CONTENT_MAX_BYTES` (default 10 MB) + `CORE_INTERNAL_SECRET`, because file bodies carry orders of magnitude more information than metadata. The secret here is the **optional** gate (`verify_internal_secret`): it is a no-op when the variable is unset, for dev parity. Only `verify_internal_write_secret` fails closed, and `PUT /files/{id}/chapters` is its sole user. See `internal-api-policy.md`.

## LLM features (intelligence addon)

- Use the OpenAI-compatible client. Configuration is the `llm` section in `search-config.yml` plus `LLM_API_KEY`.
- `auto_tags` / `summaries` / `detailed_summaries` / `transcript_refine` each have three modes (`"false"` / `"manual"` / `"on_index"`). Defaults differ per feature and are declared on `FeaturesConfig` in `addons/intelligence/app/config.py` — currently `"manual"` for `auto_tags` and `summaries`, `"false"` for `detailed_summaries` and `transcript_refine`. Read that dataclass rather than assuming a uniform default.
- Ask is a bool flag (internally `features.rag`), and it is **enabled by default** — runtime still needs an LLM provider, so it stays inert until one is configured. Stateless: it does not write to the core DB or to the addon DB.
- `auto_tags` follows a Suggest → Approve/Dismiss workflow. It is never auto-applied.
- The output language is controlled centrally by `llm.output_language`.
- Features that send file content (transcript / caption / text / frontmatter) to the LLM API are privacy-sensitive. A local LLM (ollama) is recommended.
- Ask citations are matched against the retriever's result set; anything outside that set is dropped (anti-hallucination).
- Ask applies access control twice: the internal filter (Internal API) and `drive_access_nested`.

## Transcript Refine

- The original text is preserved in `TranscriptChunk.text_original` (so it can be reverted).
- The LLM is applied per chunk → words are rebuilt by WhisperX forced alignment → embeddings are recomputed from the refined text.
- If the aligner fails (missing audio / unsupported language / OOM), keep the old word rows. Do not introduce a time-proportional fallback.

## HEIC images

- Generate HEIC thumbnails with Pillow (`pillow-heif`). Do not use ffmpeg — it lacks libheif support and produces black thumbnails.
