# Comments and watch history

Two features that build on the **viewer** concept — a per-device identity stored in a cookie.

## Viewer identity in 30 seconds

- A *viewer* is whoever is using a particular browser profile on a particular device.
- They pick a nickname (max 50 chars). It is hashed to a 16-character `viewer_id` (`SHA256(nickname)[:16]`).
- The cookie is `lit_viewer`.
- There is **no account system**. The cookie is the identity. Clearing it == becoming a new viewer.
- When no nickname is set, Litloft falls back to local-only behaviour: watch progress is kept in `localStorage` on that device and the server returns `204 No Content` rather than storing anything. Likes are a per-file counter rather than per-viewer state, so they are recorded either way.

This model is intentional: trusted home networks, personal use. Privacy-by-default, multi-device by accident only.

## Comments

Each file has a comment thread.

![File detail page with a comment thread followed by continue-watching items](../images/user-guide/comments-thread-continue-watching.png)

- Posting requires a nickname (no password). Without one the server answers `401`. The viewer ID is recorded, along with the nickname as it was at the time.
- Markdown is **not** rendered; comments are plain text, up to 1000 characters.
- There is no threading — a file has one flat list of comments, with no replies.

### Rate limits and caps

To stop accidents:

- **10 comments per 60 seconds per IP**, server-enforced (`429`).
- **500 comments per file**, after which posting returns an error.

### Editing and deletion

- A viewer can edit or delete only their own comments, matched by the viewer ID in the cookie.
- **There is no moderator override.** A master viewer has no more power over comments than anyone else, and there is no bulk-clear endpoint. Deleting someone else's comment means removing the row from the database directly.

### Where comments appear

- File detail page, at the bottom — below the viewer, tags, related files and any addon sections.

## Watch history

`WatchHistory` is a single table that does double duty: **view history** (file detail page opens) and **playback progress** (player position/duration).

### When the row is updated

- **On opening the file detail page** — a `POST /api/files/{file_id}/progress` with an empty body updates `last_played_at`. This applies to every media type, including text, Markdown, image, PDF. It fires exactly once per file you open.
- **For media files only** — once the player starts, position and duration are POSTed every 5 seconds of playback, and once more when you leave the page if the position has drifted by more than a second since the last write.

Both paths refresh `last_played_at`. A view-only POST never overwrites the playback markers of a media file (you can open a video page after a partial watch and not lose your resume position).

### Finishing a file

**Reaching the end records the final position; it does not delete the record.** The row is what makes "watched to the end" distinguishable from "never opened", and the continue-watching gate keeps a finished file out of the way anyway. Removal from history is only ever an explicit user action.

Two cases produce no completion record at all, on purpose:

- **Media with no trustworthy duration** — a live stream, or media that never probed its length. There is no position to express "finished" against, so the last periodic save is left standing rather than a completed state being fabricated.
- **Players that cannot observe completion** — a plain iframe embed simply never reports an end. Litloft reads that as *unknown*, never as *unfinished*.

### Continue-watching gate

The drive home page surfaces a *Continue watching* row. It asks the server for unfinished items, which means:

```text
playback_position < duration * 0.9
```

A view-only open leaves both at `0`, and `0 < 0` is false, so opening a PDF never puts it in the row. A file watched past 90% drops out for the same reason.

A second row, *Recently played*, asks the same endpoint with the gate off, so it includes finished files and view-only opens. Both rows are drive-scoped — watch history is never aggregated across drives.

### Removing an item

Right-click (or long-press) a card in either row and choose *Remove from history*. That issues `DELETE /api/files/{id}/progress` and drops the row for this viewer. It is the only way a record disappears.

### Personal vs shared

`WatchHistory` is **per viewer × file**. Multiple devices on the same nickname are reconciled server-side (the `viewer_id` is the hash, identical across devices that pick the same nickname).

If two devices have different nicknames they are different viewers — your phone and your laptop will each track progress independently.

### Privacy

- There is no admin-facing "viewer history list" by design, and no profile-listing API.
- Every history endpoint answers for the requesting viewer's own ID only, taken from the cookie.
- The intelligence addon's *personal_history* feature reads this table as its canonical source, scoped the same way.

## Profile

The settings page (`/settings`) lets a viewer set their nickname — which writes the `lit_viewer` cookie and rebuilds the viewer ID — along with theme and language. Per-device toggles such as autoplay and the player's beside/below layout live on the players themselves and save to `localStorage`. See [profile and preferences](profile-preferences.md).

There is no account password and no email. The profile is purely local-meets-cookie.

## Resetting a viewer

- **Forget identity**: clear the nickname on the settings page, or clear the `lit_viewer` cookie. A new nickname creates a new viewer.
- **Forget watch progress**: remove entries one at a time from the *Continue watching* / *Recently played* rows. There is no bulk "clear watch history" action, and clearing the cookie does not delete the rows — it only stops you from being the viewer they belong to.
- **Forget comments**: edit or delete each one yourself. Nobody else can do it for you through the UI.

There is no flagging or reporting workflow because Litloft is not a multi-tenant public service.
