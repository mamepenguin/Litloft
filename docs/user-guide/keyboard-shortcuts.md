# Keyboard shortcuts and gestures

Single-character shortcuts only fire when no input is focused.

## Global

| Key | Action |
|---|---|
| `?` | Open the shortcut cheat sheet for the current page |
| `Esc` | Close the topmost modal / dialog |

## Video and audio player

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` | Seek −5 s |
| `→` | Seek +5 s |
| `/` | Toggle fullscreen |

OS media keys (play/pause, next, previous) are wired through the Media Session API.

## File navigation (non-media files)

| Key | Action |
|---|---|
| `←` | Previous file in the current folder |
| `→` | Next file in the current folder |

These bindings are not active on video / audio pages — there `←` and `→` are seek controls.

## Image viewer and archive page-turner

| Gesture | Action |
|---|---|
| Swipe right / left | Previous / next page (50 px threshold) |
| Tap left edge / right edge | Same as swipe; reading-direction-aware |
| Tap centre | Toggle the controls overlay |
| Pinch | Zoom |
| Two-finger drag | Pan when zoomed |

In RTL (right-to-left) mode the swipe direction is mirrored.

## Modals

Modal-specific shortcuts can be discovered with `?` while the modal is open. Common ones:

| Key | Action |
|---|---|
| `Esc` | Cancel / close |
| `Enter` | Confirm primary action |
| `Tab` / `Shift+Tab` | Move focus |

## Custom registration

Pages register shortcuts via the `useShortcuts()` hook (`frontend/src/hooks/useShortcuts.ts`). Addons may register their own; check the `?` cheat sheet on each page to discover what is available in the current context.

## Mouse shortcuts

| Action | Result |
|---|---|
| Right-click on a file or folder | Context menu (rename, move, copy, delete, pin, etc.) |
| Long-press (touch) | Same as right-click |
| Click + Shift on a file | Range selection in the grid |
| Click + ⌘ / Ctrl on a file | Toggle individual selection |

## Player-specific gestures (video)

| Gesture | Action |
|---|---|
| Hover scrubber | Show sprite preview thumbnails |
| Double-tap | Toggle fullscreen on touch devices |

## Discoverability

If a key chord is not listed here, press `?` on the page in question. The cheat sheet is generated from the active hook registrations, so it always reflects what is actually wired.
