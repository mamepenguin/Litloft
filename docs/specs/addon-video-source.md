# Core's video player plays a source an addon names

SPEC-ID: SPEC-CORE-196
SPEC-ID: SPEC-CORE-197

Approval:

## Summary

A `.loft` player that an addon registers can get playable bytes for a provider whose site
offers no controllable embed: the addon relays the media through its own backend endpoint.
Today such a player has to rebuild everything core's `VideoPlayer` already does, including:

- the Litloft and browser controls;
- keyboard shortcuts;
- full screen, including the iPhone pseudo full screen;
- the media session and its next-track handler;
- picture in picture;
- the find overlay;
- progress.

`VideoPlayer` cannot be reused only because it takes its source from
`getStreamUrl(videoId)`.

Separately, an addon's stream response goes through the two-hop Next.js rewrite chain,
which `frontend/server-routes.js` routes core's own file streams around because it stalls
near the end of a response.

This change is for the owner of a personal Litloft who runs such an addon.

- **SPEC-CORE-196**: `VideoPlayer` takes an optional `src` and an optional `onError`. With
  `src` it plays that URL in the browser player, everywhere, and keeps every other behavior
  keyed on `videoId`. Without `src` nothing changes.
- **SPEC-CORE-197**: The custom server sends
  `/api/addons/<addon>/files/<file id>/stream` straight to the backend, as it does
  `/api/files/<file id>/stream`.

## Required items

### 1. Normal flow

**SPEC-CORE-196.**

1. An addon's `.loft` player renders `<VideoPlayer videoId={fileId} src={url}
   onError={...} ... />`, passing the other props it has from `LoftEmbedProps`
   (`initialTime`, `durationHint` as `duration`, `onEnded`, `onMediaController`,
   `posterUrl`), and `title` / `subtitleText` from its metadata when it has them.
2. `VideoPlayer` renders `BrowserVideoPlayer` whenever `src` is given, inside the iOS
   native shell as well. Without `src` it chooses between `ShellVideoPlayer` and
   `BrowserVideoPlayer` as it does today.
3. `BrowserVideoPlayer` sets the `<video>` element's `src` to `src` when given, otherwise to
   `getStreamUrl(videoId)`.

   Everything else still uses `videoId`:
   - progress through `usePlaybackProgress`;
   - the media-session artwork;
   - the subtitle tracks, including the generated caption track;
   - the controller hand-off.

   The controls, shortcuts, full screen, picture in picture, the find overlay and the
   `ended` handling are unchanged.
4. When the `<video>` element fires `error`, `BrowserVideoPlayer` calls `onError?.()`. It
   does nothing else on error, as today.

**SPEC-CORE-197.**

1. `isStreamPath(pathname)` in `frontend/server-routes.js` returns true for:
   - `^/api/files/[A-Za-z0-9_-]{12}/stream$`, as today;
   - `^/api/addons/[a-z][a-z0-9_-]*/files/[A-Za-z0-9_-]{12}/stream$`. The addon segment
     uses the same shape as `VALID_ADDON_NAME_FOR_PRELOAD`.
2. `server.js` then sends such a request to `backendProxy` instead of `nextProxy`. The
   backend route that answers it, and that route's authorization, are the addon's own.

### 2. Failure cases

- **`src` answers an error status or bytes the browser cannot decode.** The element fires
  `error`, and `onError` is called. A caller without `onError` sees what a local video
  shows on error today.
- **`src` given inside the iOS native shell.** It plays in the WebView's `<video>` with the
  browser player's controls. The shell's native player, its native picture in picture and
  its now-playing integration are not used for that file.
- **An addon has no route at the bypassed path.** The backend answers 404 directly instead
  of through the rewrite, which gives the same status.
- **A path that only looks similar** (another segment count, an id that is not 12
  characters, an upper-case addon name) is not matched and takes the rewrite, as today.

### 3. States

None new. The player's states are today's. `src` is read on render, so a new `src`
reloads the element as a new `videoId` does.

### 4. Data read and written

None new. Progress, played ranges and watch history are written through the unchanged
`usePlaybackProgress` path, keyed on `videoId`.

### 5. External services

None. `src` is whatever URL the caller passes, normally a same-origin addon endpoint.

### 6. Authorization

- **SPEC-CORE-196.** Unchanged. The browser sends its cookies to a same-origin `src`, and
  the endpoint behind it authorizes the request.
- **SPEC-CORE-197.** The custom server forwards without inspecting the request, as it does
  for core's stream. The addon route performs its own drive check. Core's `/api/internal/*`
  block is evaluated first and is unaffected.

### 7. Effect on existing features

- **Every existing `VideoPlayer` caller** (`FilePreview` for video files) passes no `src`
  and renders exactly as before: the same element `src`, and the same shell or browser
  choice.
- **Media Import's YouTube and Vimeo embeds** do not use `VideoPlayer` and are unchanged.
- **The generated caption track** (`/api/addons/intelligence/files/<videoId>/subtitles.vtt`)
  is still requested for a `src` player with no subtitles. For a file with no transcript it
  fails as it does today, and the track stays empty.
- **No existing addon serves a path ending in `/files/<id>/stream`.** The routes under
  `addons/*` were checked on 2026-11-28 and none matches, so no existing request changes
  route.

### 8. Error behavior

- **SPEC-CORE-196.** `onError` is the only addition. Nothing is logged.
- **SPEC-CORE-197.** The status the backend answers reaches the browser unchanged. A
  backend that is down gives the `backendProxy` error response that core's own stream gets
  today.

### 9. User-visible behavior

- For existing files: nothing.
- For a `.loft` whose player uses `src`: the same player, controls and shortcuts as a local
  video, playing the addon's stream.
- Inside the iOS app, such a file uses the web player rather than the native one.

### 10. Non-functional

- No new request, timer or dependency.
- The bypass removes one proxy hop from a matched addon stream, as it did for core's
  stream.

### Project questions (`docs/process/PROJECT.md`)

- **Drive boundary.** Unchanged. The addon route checks it.
- **Migrations.** None.
- **Docs.** `docs/ADDON-DEVELOPMENT.md`, "Registering a `.loft` player", gains the `src` /
  `onError` props and the stream path that bypasses the rewrite. This is an extension-point
  addition, not an incompatible change, so no row goes in *Extension-point changes*.

## Touch points

- `frontend/src/components/VideoPlayer.tsx` (`VideoPlayerProps`, `VideoPlayer`,
  `BrowserVideoPlayer`)
- `frontend/src/components/player/ShellVideoPlayer.tsx` (read only; not used when `src` is
  given)
- `frontend/src/components/__tests__/` (VideoPlayer tests)
- `frontend/server-routes.js` (`isStreamPath`)
- `frontend/server.js` (read only; the existing `isStreamPath` branch)
- `frontend/__tests__/server-routes.test.ts`
- `docs/ADDON-DEVELOPMENT.md` ("Registering a `.loft` player")
- `.claude/rules/design-decisions.md` (Addons: implementation discipline — core names no
  addon; watch history; WebSocket and proxy notes)

## Invariants

I1. `VideoPlayer` rendered without `src` produces a `<video>` whose `src` is `getStreamUrl(videoId)`, and inside the native shell it still renders `ShellVideoPlayer`.
I2. `VideoPlayer` rendered with `src` produces a `<video>` whose `src` is exactly that value, and renders `BrowserVideoPlayer` inside the native shell too.
I3. With `src`, progress is read and saved for `videoId` through `usePlaybackProgress`, the media-session artwork is `getThumbnailUrl(videoId)`, `onMediaController` receives the controller, and `ended` calls `notifyEnded` and then `onEnded`, as without `src`.
I4. An `error` event on the `<video>` element calls `onError` once per event. Without `onError`, an error changes nothing compared with today.
I5. `isStreamPath` is true for `/api/files/<12-char id>/stream` and for `/api/addons/<name>/files/<12-char id>/stream` with `<name>` matching `^[a-z][a-z0-9_-]*$`, and false for every other path, including `/api/internal/...`, other segment counts, query strings and ids of another length.
I6. Core names no addon or provider in this change: neither the player nor the route pattern mentions a specific addon.

## Checked, no action

- **Passing `src` through `ShellVideoPlayer`.** The iOS shell builds its stream from the file
  id on the native side, so a URL would need a native change. The web player inside the
  shell plays it instead.
- **Turning off the generated caption track when `src` is given.** A transcript-backed file
  played through `src` should keep its captions, and a missing track is already harmless.
- **An error overlay inside `VideoPlayer`.** The caller decides what to show. Local video
  errors keep today's look.
- **A `LoftEmbedProps` change.** The addon's player composes `VideoPlayer` itself, and
  `LoftPlayer` is unchanged.
- **Bypassing every `/api/addons/*` path.** Only the stream shape stalls. Other addon paths
  keep the rewrite and its body-size handling.
