# Correct behavior: what the page shows after an unlock

No spec covered this. It is the unspecified-behavior entry for a bug fix
(`docs/process/spec-and-design.md`). In tests, cite it as
`UNSPEC fix-unlock-refresh`.

## Behavior

A successful unlock on `/unlock` ends in a full page load of the redirect target (the
`redirect` query when it is a same-origin path, otherwise `/`), never in a client-side
navigation. Everything the client read under the old cookie is read again under the new
one, with no reload by the viewer:

- the sidebar's drive switcher lists the unlocked drives, names the drive being shown,
  and shows **Lock** (and the admin entries when the password carries the admin group);
- Cmd+K's jump destinations include the unlocked drives;
- the WebSocket connects with the new cookie, so live updates for the unlocked drives
  arrive (the backend fixes a connection's groups when it connects).

A wrong password or a failed request leaves the viewer on `/unlock` with the error, as
before.

## User-visible result

Unlocking from the drive picker or from a locked drive's **Unlock** link lands on the
target with the unlocked drive in the sidebar and **Lock** available. Before the fix the
sidebar kept its pre-unlock state until a reload, which read as "the unlock did not work".
