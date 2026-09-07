# Profile and preferences

Litloft has no traditional account system. What looks like a profile is really a small bag of preferences scoped to your browser. Some live server-side (DB), some live in cookies, some in `localStorage`.

## What is stored where

| Setting | Location | Scope |
|---|---|---|
| Nickname | Cookie `lit_viewer` (server hashes it on read) | Per device, per browser profile |
| Watch progress | DB (`WatchHistory`), keyed by viewer ID | Per viewer (synced across devices that share nickname) |
| Tag and comment authorship | DB, keyed by viewer ID | Per viewer |
| Theme (`light` / `dark` / `system`) | `localStorage`, `theme-preference` | Per device |
| Language | Cookie `NEXT_LOCALE` | Per device |
| Autoplay (video / audio) | `localStorage` | Per device, per player |
| Reading direction (image viewer) | `localStorage` | Per device |
| Slideshow interval | `localStorage` | Per device |
| Grid / list view per folder | `localStorage` | Per device |

## Where to change settings

The in-app settings page is at `/settings` (linked from the user menu). It holds
three cards:

- **Profile** — your nickname, which sets the `lit_viewer` cookie. An empty value clears the cookie and reverts to local-only mode.
- A short note on what the nickname is used for and what stays local.
- **Display and behaviour** — three rows, each a label and its control:
  - **Appearance** — `light` / `dark` / `system`. Applied immediately via a `data-theme` attribute on `<html>`.
  - **Language** — the UI language. The cookie is updated and the page reloads to refresh translations.
  - **Sidebar order** — reset the sidebar's section and item ordering back to the defaults. What it will do is stated in the confirmation, so the row itself carries no explanation.

Below 640px each row stacks its control under its label.

There is **no "clear watch history" action** here or anywhere else. History is
removed one entry at a time, from the *Continue watching* and *Recently played*
rows — see [comments and watch history](comments-history.md).

## Per-player preferences

The autoplay toggle on each player and the reading-direction toggle on the image viewer save to `localStorage` so they persist across sessions on the same device. They do not sync between devices.

## What does *not* exist

- No password reset (no password to reset; viewer identity is just a cookie).
- No email (the project is offline-first by design).
- No avatars (apart from the channel avatars used by media-import for embedded YouTube/Vimeo metadata).
- No notifications or DMs.

If you want richer per-viewer state in the future, the data model already supports it: `viewer_id` is the canonical key.

## How the cookie hash works

When you set a nickname:

```text
viewer_id = SHA256(nickname)[:16]   # hex
```

- It is **deterministic** — the same nickname always hashes to the same ID.
- It is **truncated** to 16 hex chars (~64 bits) for compact storage and short URL fragments. There is no attempt to be cryptographically robust against collisions; for a few-hundred-viewer home install, the probability is negligible.
- The cookie is `httponly` for the JWT but **not** for `lit_viewer` — the frontend reads it client-side to display the nickname.

## Privacy behaviour without a nickname

If you visit Litloft and do not set a nickname:

- All UI works.
- Posting comments is blocked (the form requires a nickname).
- Watch progress writes return `204 No Content` and are not persisted server-side. The client-side UI may use `localStorage` for resume on the same device.
- Tagging is allowed (tags are per drive, not per viewer).

This is the *graceful-degradation* mode for read-mostly visitors.

## Logging out

- **Soft logout** — clear the `lit_viewer` cookie via the settings page; the JWT is unaffected.
- **Drive logout** — to forget unlocked password groups, clear the `access_token` cookie. There is no UI button for this; use the browser's site-data tools.

## Multiple devices

Two devices with the same nickname share a `viewer_id` and therefore a watch history. If you want them tracked separately, use different nicknames. There is no fancier sync — Litloft assumes a small enough user base that this works.
