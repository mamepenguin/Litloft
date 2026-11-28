# Core's video player plays a source an addon names

SPEC-ID: SPEC-CORE-196
SPEC-ID: SPEC-CORE-197

Approval:

## Summary

An addon can register a `.loft` player for a provider whose site offers no controllable
embed, and relay the media through its own in-process backend endpoint. Such a player
should look and behave like a local video. Today it would have to rebuild everything core's
`VideoPlayer` does:

- the Litloft and browser controls;
- shortcuts;
- full screen, including the iPhone pseudo full screen;
- the media session, with the queue's next and previous handlers;
- picture in picture;
- the find overlay;
- progress.

`VideoPlayer` cannot be reused only because it takes its source from
`getStreamUrl(videoId)`. Separately, the addon's stream response would take the two-hop
Next.js rewrite chain. `frontend/server-routes.js` routes core's own file streams around
that chain because it stalls near the end of a response.

This change is for the owner of a personal Litloft who runs such an addon.

- **SPEC-CORE-196**: `VideoPlayer` takes an optional `src` and an optional `onError`. With
  `src` it plays that URL in the browser player, everywhere, and keeps every other behavior
  keyed on `videoId`. Without `src` nothing changes.
- **SPEC-CORE-197**: The custom server sends `/api/addons/<addon>/files/<file id>/stream`
  straight to the backend, as it does `/api/files/<file id>/stream`.

## Required items

### 1. Normal flow

**SPEC-CORE-196.**

1. An addon's `.loft` player imports `VideoPlayer` from `@/components/VideoPlayer` and
   renders it with:
   - `videoId={fileId}`;
   - `src` set to the addon's own stream URL, `/api/addons/<name>/files/<fileId>/stream`,
     not `LoftEmbedProps.url` (the external URL stored in the `.loft`);
   - `onError={...}`;
   - from `LoftEmbedProps`: `initialTime`, `duration={durationHint}`, `onEnded`,
     `onMediaController` and `posterUrl`;
   - `title={mediaSessionMetadata?.title}` and
     `subtitleText={mediaSessionMetadata?.artist}`.

   It does not render the `pictureOverlay` it receives, because `VideoPlayer` draws core's
   find overlay itself. `docs/ADDON-DEVELOPMENT.md` states this mapping.
2. `VideoPlayer` renders `BrowserVideoPlayer` whenever `src` is a non-empty string,
   including inside the iOS native shell. Otherwise, when `src` is `undefined` or `""`, it
   chooses between `ShellVideoPlayer` and `BrowserVideoPlayer` as it does today.
3. `BrowserVideoPlayer` sets the `<video>` element's `src` to `src` when that is a non-empty
   string, and otherwise to `getStreamUrl(videoId)`. Everything else is unchanged and keyed
   on `videoId`:
   - progress (`usePlaybackProgress`);
   - the media session, set up when `title` is given, with `getThumbnailUrl(videoId)` as
     artwork and the queue's next and previous handlers inside a queue page;
   - the subtitle tracks, including the generated caption track;
   - the controls, shortcuts, full screen, picture in picture and find overlay;
   - the `loadedmetadata` autoplay decision (the `autoPlay` prop or the Autoplay
     preference);
   - the `ended` handling.
4. The effect that builds the media controller depends on `src` as well as on
   `videoElement`, `videoId` and `onMediaController`. A new `src` under the same `videoId`
   therefore rebuilds the controller and is handled as a new `videoId` is:
   - `usePlaybackProgress` seeks to `initialTime` when one is given, and otherwise to the
     stored position;
   - playback then starts only if the `loadedmetadata` autoplay decision says so.

   No caller changes `src` under one `videoId` today. This fixes what one would get.
5. When the `<video>` element fires `error`, `BrowserVideoPlayer` calls `onError?.()`. This
   is an `onError` attribute on the `<video>` element, added next to the existing handlers.
   A `<track>` element's load failure fires on the track, not on the video, and does not call
   it.

**SPEC-CORE-197.**

1. `isStreamPath(pathname)` in `frontend/server-routes.js` takes the request's pathname, with
   no query string, as `server.js` already passes it. It returns true for:
   - `^/api/files/[A-Za-z0-9_-]{12}/stream$`, as today;
   - `^/api/addons/[a-z][a-z0-9_-]*/files/[A-Za-z0-9_-]{12}/stream$`. The addon segment
     has the shape of `VALID_ADDON_NAME_FOR_PRELOAD`.

   A request whose path matches is bypassed whatever query it carries.
2. `server.js` sends a matched request to `backendProxy` instead of `nextProxy`. The
   `/api/internal` block is still evaluated first.
3. The backend route that answers is the addon's in-process router. It authorizes by the
   file id in the path, because a `<video src>` cannot send `X-Lit-Drive`. The docs state
   what such a route must do:
   - load the file by id and call `check_drive_access`;
   - answer 404 for a locked or unknown drive and for a trashed file, as core's stream
     does, and 410 or 404 for a missing file.

   Core does not gate in-process routes by `drives.json` policy
   (`design-decisions.md`), so whether the route honours the addon's per-drive policy is
   the addon's own decision. The docs say that too.

### 2. Failure cases

- **`src` answers an error status or undecodable bytes.** The element fires `error`, and
  `onError` is called. A caller without `onError` sees what a local video shows on error
  today.
- **`src` given inside the iOS native shell.** It plays in the WebView's `<video>` with the
  browser player's controls. The shell's native player, its native picture in picture and
  its Now Playing integration are not used for that file.
- **The backend is unreachable on a bypassed path.**
  - `backendProxy`'s error handler writes nothing, so the request waits until the browser
    gives up. This is what core's own `/api/files/<id>/stream` does today.
  - Before this change the addon path went through `nextProxy`, which answers 502 at once.
    The difference shows only while the backend restarts (`## Checked, no action`).
- **The addon has no route at the bypassed path.** The backend answers 404 directly.
- **Lookalike paths.** Another segment count, an id that is not 12 characters, or an addon
  name with upper case or a leading digit is not matched and takes the rewrite, as today.

### 3. States

None new. The player's states are today's.

- A change of `src` under the same `videoId` is handled as a new `videoId` (item 1,
  step 4).
- Inside the shell, switching `src` between a non-empty string and `undefined` swaps
  `BrowserVideoPlayer` and `ShellVideoPlayer`, which remounts the player. No caller does
  that: an addon player always passes `src`, and `FilePreview` never does.

### 4. Data read and written

None new. Progress, played ranges and watch history go through the unchanged
`usePlaybackProgress` path, keyed on `videoId`.

### 5. External services

None. `src` is whatever URL the caller passes, normally a same-origin addon endpoint.

### 6. Authorization

- **SPEC-CORE-196.** Unchanged. The browser sends its cookies to a same-origin `src`, and
  the endpoint authorizes the request.
- **SPEC-CORE-197.** The custom server forwards without inspecting the request, as it does
  for core's stream. The in-process addon route performs the drive check from the file id.
- **Independent-service addons.** Their `/api/addons/<name>/...` routes pass through core's
  `addon_proxy`. Header-less media can reach them through `drive_optional` with a
  `file_access` pre-check, and `stream: true` routes are streamed. But
  `_STREAM_WALL_CLOCK_TIMEOUT_SEC = 600` cuts every proxied stream response after ten
  minutes, which ends a long video's open range mid-play. They are not a supported `src`
  (`## Checked, no action`), and the docs say why.

### 7. Effect on existing features

- **Existing `VideoPlayer` callers** (`FilePreview` for video files) pass no `src`. They
  render as before: the same element `src` and the same choice of shell or browser player.
  The controller effect's extra dependency is constant for them.
- **Media Import's YouTube and Vimeo embeds** do not use `VideoPlayer`. They are unchanged.
- **The generated caption track** (`/api/addons/intelligence/files/<videoId>/subtitles.vtt`)
  is still requested for a `src` player with no subtitles. For a file with no transcript it
  fails as it does today, and does not call `onError`.
- **Find outlines (SPEC-CORE-135 I7).** A `src` `.loft` plays in core's `<video>`, so it is
  the "native" case of I7: outlines are placed in `videoWidth` × `videoHeight`. No
  revision is needed.
- **Autoplay.** A `src` `.loft` follows the Autoplay preference as a local video does:
  - it starts on `loadedmetadata` when the preference is on;
  - it does not start when the preference is off, including after a queue action.

  SPEC-CORE-190 I11 already excepts `.loft` items from "a queue action starts playing
  whatever the preference says". Its rule still holds, so it needs no revision.
- **Addon paths that changes route.** No addon serves a path ending in `/files/<id>/stream`.
  The manifests and routers under `addons/*` were checked on 2026-11-28, so no existing
  request changes route.
- **Independent-service addon traffic through `addon_proxy`.** It is unchanged except for
  dropping the rewrite hop on a matched path, which no such addon serves today.

### 8. Error behavior

- **SPEC-CORE-196.** `onError` is the only addition. Nothing is logged.
- **SPEC-CORE-197.** The status the backend answers reaches the browser unchanged. When
  the backend is unreachable, the outcome is the one in item 2.

### 9. User-visible behavior

- **Existing files.** Nothing changes.
- **A `.loft` whose player uses `src`.** It gets the same player, controls, shortcuts,
  queue controls and autoplay behavior as a local video, playing the addon's stream.
- **The iOS app.** Such a file uses the web player there rather than the native one.

### 10. Non-functional

- No new request, timer or dependency.
- The bypass removes one proxy hop from a matched addon stream, as it did for core's
  stream.

### Project questions (`docs/process/PROJECT.md`)

- **Drive boundary.** Unchanged. The addon route checks it.
- **Migrations.** None.
- **Docs.** `docs/ADDON-DEVELOPMENT.md`, "Registering a `.loft` player", gains a paragraph:
  - the `src` and `onError` props, and the prop mapping in item 1, step 1;
  - that the stream path shape `/api/addons/<name>/files/<id>/stream` bypasses the
    rewrite;
  - that the route must be an in-process router that authorizes by file id.

  This is an extension-point addition, not an incompatible change, so it adds no
  *Extension-point changes* row.
- **Device checks** (`agent_cannot_verify`):
  - playback in the iOS app through the web player;
  - no stall near the end of a long response on the real LAN.

  The owner checks both by hand in R-5, with the first addon that uses `src`, before that
  addon ships. Core's own change ships on its automated tests.

## Touch points

- `frontend/src/components/VideoPlayer.tsx`: `VideoPlayerProps`, `VideoPlayer`,
  `BrowserVideoPlayer`, and the controller effect's dependencies
- `frontend/src/components/player/ShellVideoPlayer.tsx` (read only; not used when `src` is
  given)
- `frontend/src/components/__tests__/` (VideoPlayer tests)
- `frontend/server-routes.js` (`isStreamPath`)
- `frontend/server.js` (read only; the existing `isStreamPath` branch and
  `backendProxy`'s error handler)
- `frontend/src/__tests__/server-routes.test.ts`
- `backend/app/routers/addon_proxy.py` (read only; why independent-service addons are not a
  supported `src`)
- `docs/ADDON-DEVELOPMENT.md` ("Registering a `.loft` player")
- `.claude/rules/design-decisions.md` (read only; addon implementation discipline: core
  names no addon)

## Invariants

I1. `VideoPlayer` rendered with `src` `undefined` or `""` produces a `<video>` whose `src` is `getStreamUrl(videoId)`. Inside the native shell it renders `ShellVideoPlayer` and no `<video>`.
I2. `VideoPlayer` rendered with a non-empty `src` produces one `<video>` whose `src` is exactly that value, inside and outside the native shell.
I3. With `src`, these behave as they do without it:
- progress is read and saved for `videoId`;
- `onMediaController` receives a controller, and `null` on unmount;
- `ended` calls `notifyEnded` and then `onEnded`;
- when `title` is given, the media session's artwork is `getThumbnailUrl(videoId)`, and inside a queue page its next and previous handlers are the queue's.
I3b. Changing `src` while `videoId` stays the same rebuilds the controller and resumes from the saved position. It never saves a position read from the new element before resuming.
I3c. With `src`, as without it, the element starts playing on `loadedmetadata` when the `autoPlay` prop is true or the Autoplay preference is on, and does not start otherwise.
I4. An `error` event on the `<video>` element calls `onError` once per event. A `<track>` load failure, including a 404 for the generated caption track, does not call it. Without `onError`, an error changes nothing compared with today.
I5. `isStreamPath` is true for the pathnames `/api/files/<12-char id>/stream` and `/api/addons/<name>/files/<12-char id>/stream`, where `<name>` is any string matching `^[a-z][a-z0-9_-]*$`. It is false for every other pathname, including `/api/internal/...`, other segment counts, ids of another length, and names with upper case or a leading digit. A request to a matching path is sent to `backendProxy` whatever its query string.

## Checked, no action

- **Passing `src` through `ShellVideoPlayer`.** The shell builds its stream from the file id
  on the native side, so a URL would need a native change. The web player inside the shell
  plays it instead.
- **Turning off the generated caption track when `src` is given.** A transcript-backed file
  should keep its captions, and a failed track is already harmless.
- **An error overlay inside `VideoPlayer`.** The caller decides what to show, and local
  video errors keep today's look.
- **A `LoftEmbedProps` change**, such as an `autoPlay` from queue actions. The `.loft`
  queue rule of SPEC-CORE-190 I11 is kept.
- **Bypassing every `/api/addons/*` path.** Only the stream shape stalls. Other addon paths,
  such as SSE and uploads, keep the rewrite and its body-size handling.
- **Making `backendProxy` answer 502 when the backend is unreachable.** That would change
  core's own stream too. Today both wait until the browser gives up, which shows only while
  the backend restarts. It is left for a separate change, if wanted.
- **Supporting independent-service addons as a `src`.** `addon_proxy` cuts every proxied
  stream at 600 s of wall time. Lifting that cap is a separate change. An addon that needs
  `src` today serves the stream from an in-process router.
- **A "core names no addon" invariant.** It is a review rule (`design-decisions.md`), not
  observable behavior. The diff is checked for addon or provider literals in review.
