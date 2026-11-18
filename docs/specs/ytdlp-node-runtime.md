# Node.js as yt-dlp's JavaScript runtime

SPEC-ID: SPEC-ADDON-141
SPEC-ID: SPEC-ADDON-142
SPEC-ID: SPEC-CORE-139

Approval:

## Summary

yt-dlp needs an external JavaScript runtime to solve YouTube's JS challenges, and only
Deno is enabled by default. Neither Litloft container that runs yt-dlp has one: the
intelligence container (YouTube `.loft` lookup, frame reads and the whole-video fetch)
and the backend container (the media_import addon, which runs in-process). This change
installs Node.js 24 and yt-dlp's EJS component into both, and turns the Node runtime on
at every place Litloft starts yt-dlp. SPEC-ADDON-141 covers intelligence, SPEC-ADDON-142
covers media_import.

SPEC-CORE-139: the backend image build stops when an addon's `requirements.txt` fails to
install or its `install.sh` exits non-zero. Today both loops in `backend/Dockerfile`
ignore failures, so a PyPI timeout during a build produces an image without the addon's
packages, and `docker compose up -d --build` replaces the running backend with it. On
2026-11-18 a pip install of `nodejs-wheel` on the production machine timed out reading
from `files.pythonhosted.org`. With this change the build fails and the running version
is kept, as `CLAUDE.md` already promises for a failed build.

Measured on 2026-11-18. In production, yt-dlp 2026.10.26 in the intelligence container
warns `No supported JavaScript runtime could be found` and still lists formats up to
1080p, through the `visionos` player API, which needs no JS. In a `python:3.12-slim`
container with `nodejs-wheel` 24 and `yt-dlp[default]`, the same video reports
`JS runtimes: node-24.19.0`, `Solving JS challenges using node`, and adds the `tv samsung`
player API, whose formats include 720p. Today the results are the same. The change is
for resilience. If YouTube stops answering the `visionos` path, then without a runtime
every `.loft` lookup fails after a first success, and each video stops after three
counted failures. 6,498 `.loft` were still unfetched at the time.

Node rather than Deno: the Deno team joined Cloudflare in October 2026, and Deno's runtime
gets about one more year of maintenance releases.

## Required items

### 1. Normal flow

Image build:

1. The intelligence image installs `yt-dlp[default]>=2026.10.26` (the `default` extra
   pins `yt-dlp-ejs` to the version that yt-dlp release expects) and
   `nodejs-wheel>=24,<25` from pip. `nodejs-wheel` puts a `node` executable on `PATH`.
   `addons/intelligence/Dockerfile.test` installs the same two specifiers.
2. When media_import is checked out, the backend image installs media_import's
   `requirements.txt` as it does today. That file now names `yt-dlp[default]>=2026.10.26`
   and `nodejs-wheel>=24,<25`. `addons/media_import/Dockerfile.test` already installs
   that file.
2a. `backend/Dockerfile` installs each checked-out addon's `requirements.txt`, and runs
   each addon's `install.sh`, as today, but a non-zero exit from either fails the
   `docker build` step. When no addon has a `requirements.txt` or an `install.sh`, the
   step succeeds and does nothing.

At run time:

3. intelligence starts yt-dlp as a subprocess in two functions: the lookup `run_lookup`
   (`yt-dlp -J`) and the whole-video download. `run_lookup` has three callers: the frame
   read (15 s budget), the storyboard index in `clip.py` (60 s) and the `.loft` fetch
   (60 s). Both argument lists carry `--no-js-runtimes --js-runtimes node`, so Node is
   the only runtime yt-dlp may use. A `.loft` fetch runs two extractions, the lookup and
   the download, and each may solve a challenge.
4. media_import constructs `yt_dlp.YoutubeDL` in seven places. Each options dict gets
   exactly one new key, `js_runtimes: {"node": {}}`, which replaces yt-dlp's default
   (Deno) with Node alone. The other keys are today's and stay as they are:

   | Place | Keys other than `js_runtimes` |
   |---|---|
   | `service.py` title extraction | `quiet: True`, `no_warnings: True` |
   | `service.py` metadata | `quiet: True`, `no_warnings: True` |
   | `service.py` captions | `quiet`, `no_warnings`, `skip_download`, `writeautomaticsub`, `writesubtitles` (all `True`), `subtitlesformat: "vtt"`, `subtitleslangs: [lang]`, `outtmpl` |
   | `service.py` audio download for speech-to-text | `quiet: True`, `no_warnings: True`, `format: "bestaudio/best"`, `outtmpl`, `keepvideo: False`, `postprocessors: [FFmpegExtractAudio to m4a]` |
   | `providers/youtube.py` channel and playlist listing | `quiet`, `no_warnings`, `extract_flat`, `skip_download` (all `True`), and `playlistend: limit` when a limit is given |
   | `providers/youtube.py` source envelope | `quiet`, `no_warnings`, `extract_flat`, `skip_download` (all `True`), `playlistend: 1` |
   | `manager.py` channel id lookup | `quiet`, `no_warnings`, `extract_flat`, `skip_download` (all `True`), `playlistend: 1` |
5. When YouTube serves a JS challenge, yt-dlp solves it with Node, using the EJS scripts
   from the installed Python package. Nothing is fetched from npm or GitHub.

### 2. Failure cases

- **Node is missing or will not start** (the image was built without it, or a test image
  lacks it): yt-dlp warns that no JS runtime was found and goes on without one, as it
  does today. The outcome is what yt-dlp returns without a runtime. Litloft does not
  treat the missing runtime as an error: no failure is counted, no back-off starts, and
  no import fails because of it.
- **The EJS package does not match yt-dlp's pinned version**: yt-dlp rejects it and
  behaves as if there were no runtime. `yt-dlp[default]` installs the matching version,
  so this happens only if something installs `yt-dlp-ejs` separately. Nothing in this
  change does.
- **Challenge solving fails or times out inside yt-dlp**: yt-dlp drops the formats it
  could not unlock and returns the rest, or fails the extraction. Litloft handles that
  result the same way it handles any yt-dlp result today: the lookup failure counting,
  the refusal back-off, the import error message and the caption retry are all
  unchanged.
- **pip cannot install `nodejs-wheel`** (no wheel for the platform, or PyPI is
  unreachable during the build):
  - intelligence: the image build fails, and the running version is kept.
  - backend: the build fails (SPEC-CORE-139), and the running version is kept. The
    operator sees pip's error in the build output and runs the build again.
  - `nodejs-wheel` publishes manylinux wheels for aarch64 and x86_64. The install was
    measured on linux/arm64 (`python:3.12-slim`, Debian 13), the production platform.
    The download is about 60 MB, so a slow link to PyPI makes the build slower or makes
    it time out, as it did once on 2026-11-18.

### 3. States

None new. A container either has a working `node` or it does not. Litloft keeps no
state about it. The `.loft` fetch states (`loft_source`, `loft_fetch_failures`, the
back-off) are unchanged.

### 4. Data read and written

None. No table, column, file or cache changes. yt-dlp writes nothing new. Node runs
with yt-dlp's own `--permission` sandbox, and the challenge scripts go in on stdin.

### 5. External services

YouTube, as today. With a runtime, yt-dlp makes extra player API requests (`tv samsung`
before `visionos`): 2 more per extraction, measured in item 10. The existing 30-second spacing between backlog
fetches and the refusal back-off still apply. No new host is contacted:
`remote_components` stays unset, and `--remote-components` is never passed.

### 6. Authorization

None. No endpoint or access check changes.

### 7. Effect on existing features

- intelligence: everything that reads the lookup's description sees the formats yt-dlp
  returns with a runtime, which can include formats from the `tv samsung` client. That
  covers `pick_format` and the download's format selector (the chosen 720p-or-lower
  stream may come from a different client than today), the storyboard (`sb*`) formats
  read by the storyboard index and by the `.loft` fetch's storyboard step, and the
  file size `_space_allows` reads (a format without a size makes it keep the larger 4 GiB
  margin, the cautious side). Selection rules, the space margins and the storyboard
  parsing are unchanged, and any of these differences is accepted.
- intelligence frame reads (`GET /files/{id}/frame`, Ask frames, the MCP tools) read the
  stream URL that the lookup returned. They inherit the change through the lookup and
  start no yt-dlp process of their own.
- media_import: import, captions, subscriptions and the source envelope get the runtime.
  Other sites yt-dlp supports are unaffected: yt-dlp uses the runtime only for extractors
  that ask for it.
- Image size: about 200 MB more for each of the intelligence and backend images
  (`nodejs_wheel` measured at 198 MB installed).
- The backend image takes only addons with a `backend/` directory. Today those with a
  `requirements.txt` are media_import and cloud-sync, and cloud-sync also has an
  `install.sh` (`apt-get install rclone`). A failure in any of them now fails the
  backend build instead of producing an image without those packages or without
  `rclone`. Both succeed on production's current build (`pip check` clean, `rclone`
  v1.60.1 present). An addon that is not checked out contributes nothing, as today.
  photo_diary has a `backend/` directory but neither file.
- Test images: `addons/intelligence/Dockerfile.test` and `addons/media_import/Dockerfile.test`
  install the same packages, so tests run the same yt-dlp as production.
- Backend image, shared libraries: the `default` extra adds `requests`, `urllib3`,
  `brotli`, `mutagen`, `pycryptodomex` and `yt-dlp-ejs`, which core does not import, and
  asks for `websockets>=13` and `certifi>=2026.10.19`. Production's backend already has
  `websockets` 17.3 (from core's `uvicorn[standard]`) and `certifi` 2026.10.23. pip
  without `--upgrade` keeps an installed version that satisfies the floor, so neither
  moves.

### 8. Error behavior

Nothing new to see or log. yt-dlp's existing warnings stay where they go today:
intelligence captures the lookup's stderr only to report a failure, and discards the
download's. media_import runs yt-dlp with `quiet` and `no_warnings`. The warning
`No supported JavaScript runtime could be found` is therefore not shown anywhere, with or
without this change.

### 9. User-visible behavior

None in the UI. An operator can see the change in two places:

- `docker compose exec intelligence yt-dlp -v --js-runtimes node` (and the same in
  `backend`) prints `JS runtimes: node-24.…` and lists `yt_dlp_ejs` under optional
  libraries.
- `docs/addons/intelligence.md` and `docs/addons/media-import.md` say that the image
  installs Node.js for yt-dlp. The intelligence page quotes the new floor
  (`yt-dlp[default]>=2026.10.26`). The media-import page's troubleshooting row tells the
  operator to rebuild the backend image without the layer cache
  (`docker compose build --no-cache backend`, then `docker compose up -d backend`) to pick
  up a newer yt-dlp, as the intelligence page already does.

### 10. Non-functional

- About 200 MB more disk for each image. Production had 59 GiB free.
- Time and requests: see the measurement below. The `.loft` fetch is limited to one at
  a time, so concurrency does not change.

  Measured 2026-11-18 on the production machine, in a throwaway container of the
  intelligence image with no mounts, yt-dlp 2026.10.26, three runs per video on two
  videos, `yt-dlp -J`: without a runtime 1.4-1.8 s and 4 requests to YouTube; with
  `--no-js-runtimes --js-runtimes node` 2.2-2.5 s (one run 5.5 s), 6 requests and one
  challenge solve. A lookup therefore costs about 0.8 s and 2 requests more. The frame
  read keeps well inside its 15 s budget, and the 60 s limits of the storyboard index
  and the `.loft` fetch are not approached. A `.loft` fetch runs two extractions, so it
  sends about 4 more requests than today, against the 30-second spacing between backlog
  fetches.
- Privacy: no cookie or credential is added. Node runs only yt-dlp's bundled challenge
  scripts.
- Node 24 is an LTS line supported upstream until April 2028. The pin `>=24,<25` keeps
  minor and patch updates and avoids an unplanned major update.

## Touch points

- `addons/intelligence/Dockerfile` (protected: Dockerfiles are CRITICAL in
  `docs/process/PROJECT.md`): the yt-dlp install line becomes `yt-dlp[default]` plus
  `nodejs-wheel>=24,<25`.
- `addons/intelligence/Dockerfile.test` (protected): the same install line.
- `addons/intelligence/app/youtube_source.py`: the argument lists of `run_lookup` and of
  the download.
- `addons/media_import/backend/requirements.txt`: `yt-dlp[default]>=2026.10.26` and
  `nodejs-wheel>=24,<25`.
- `addons/media_import/backend/service.py`, `subscription/providers/youtube.py`,
  `subscription/manager.py`: every `yt_dlp.YoutubeDL(...)` options dict.
- `addons/media_import/Dockerfile.test` (protected): unchanged. It already installs the
  addon's `requirements.txt`. Listed because what it installs changes.
- `backend/Dockerfile` (protected): the two loops over `addons/*/requirements.txt` and
  `addons/*/install.sh` stop ignoring a failure. What it installs also changes, through
  media_import's `requirements.txt`.
- `docs/addons/intelligence.md`: the install sentence and the yt-dlp floor.
- `docs/addons/media-import.md`: the install sentence and the rebuild advice in the
  troubleshooting table.
- Submodule pointers `addons/intelligence` and `addons/media_import` in the core
  repository.
- Rule passed through: `.claude/rules/design-decisions.md`, "No core-to-addon
  dependencies". The runtime is declared by the addons, not by core.

## Invariants

I1. With media_import checked out, the built backend image, and the built intelligence
image, each answer `yt-dlp -v --no-js-runtimes --js-runtimes node` with a `node` JS
runtime of major version 24 and list `yt_dlp_ejs` among the optional libraries. Checked
in R-5 against the running stack (SPEC-ADDON-141 for intelligence, SPEC-ADDON-142 for
backend).
I2. Every yt-dlp process the intelligence addon starts, from any of the lookup's three
callers and from the download, has `--no-js-runtimes` followed later by
`--js-runtimes node`, no other `--js-runtimes`, and no `--remote-components`.
I3. Every `yt_dlp.YoutubeDL` that media_import constructs gets options whose
`js_runtimes` equals `{"node": {}}` and that have no `remote_components` key.
I4. Each of media_import's seven options dicts, with `js_runtimes` removed, equals the row
for its place in the table in item 4.
I5. A `.loft` lookup whose yt-dlp exits 0, prints a JSON object on stdout and prints the
missing-runtime warning on stderr is a successful lookup: it adds no failure to
`loft_fetch_failures` and does not start or extend the back-off.
I6. With no `node` on `PATH`, constructing `yt_dlp.YoutubeDL` with any of media_import's
seven options dicts raises nothing.
I7. This change adds no addon name and no JS runtime name to `backend/app/`,
`backend/Dockerfile` or `backend/requirements.txt`.
I9. Building `backend/Dockerfile` fails when any checked-out addon's `requirements.txt`
fails to install or any addon's `install.sh` exits non-zero, and succeeds when no addon
has either file (SPEC-CORE-139).
I8. `addons/intelligence/Dockerfile` and `addons/intelligence/Dockerfile.test` install
yt-dlp and `nodejs-wheel` with the same version specifiers.

## Checked, no action

- **Debian's `nodejs` package via apt**: Debian 13 ships 20.19, which is enough for
  yt-dlp (Node 20 or later). For the backend image it would have to go in
  `backend/Dockerfile`, which is core code installing a dependency that only one addon
  uses (`design-decisions.md`, no core-to-addon dependencies). It would also tie the
  Node major version to the base image. The pip package keeps the runtime with the addon
  that needs it, in the same file as yt-dlp.
- **Copying the binary from the official `node` image** (`COPY --from=node:24-slim`):
  same core-Dockerfile problem for the backend, and one more image to pull.
- **Deno**: enabled by default in yt-dlp, but upstream development stops after about a
  year (Cloudflare acquisition, October 2026).
- **`remote_components` (`ejs:npm`, `ejs:github`)**: not needed, because the EJS scripts
  come from the Python package. Fetching code at run time would add a network
  dependency and an unpinned script.
- **A start-up check or warning when `node` is missing**: yt-dlp still works without a
  runtime, often fully (today's state), so the missing runtime is not a fault to report.
  The operator check in item 9 is enough.
- **Showing yt-dlp's runtime warning in logs or the UI**: the warning disappears once
  Node is installed, and showing it would add noise in the test images.
- **Pinning yt-dlp to an exact version**: both addon pages tell operators to rebuild
  without the layer cache to pick up a newer yt-dlp when YouTube changes (the
  media-import page gains that advice in this change). A floor (`>=2026.10.26`, the
  version measured) keeps that working, and the `default` extra moves `yt-dlp-ejs` with
  it.
- **Installing `yt-dlp-ejs` on its own instead of the `default` extra**: each yt-dlp
  release accepts exactly one `yt-dlp-ejs` version, so a separate line drifts out of step
  with a yt-dlp floor and the runtime silently goes unused. The extra's other packages do
  not move core's (item 7).
- **pip's `--timeout` / `--retries` in `backend/Dockerfile`**: a failed build that keeps
  the running version is the safe outcome, and a retry is the operator running the
  build again. Longer timeouts would only hide a slow mirror.
- **An invariant for the docs sentences**: they are prose, checked in review.
- **An invariant for the submodule pointers**: the two-step submodule procedure in
  `CLAUDE.md` and `check-traceability` (a citation counts only at the pinned commit)
  already cover it.
- **Test-image parity for media_import**: `addons/media_import/Dockerfile.test` installs
  the addon's own `requirements.txt`, so it matches by construction. Only intelligence
  writes the install line twice (I8).
- **The 30-second spacing or back-off for the extra requests**: about 4 more requests
  per `.loft` fetch (item 10) next to a 30-second gap between backlog fetches. The
  refusal back-off already handles the case where YouTube starts refusing.
- **Other yt-dlp users**: `knowledge`, `cloud-sync` and core run no yt-dlp. Core's
  `chapters.py` and `schemas.py` mention yt-dlp only in docstrings.
