# Inbox

**受信箱** / **Inbox** is the drive's list of files that arrived on purpose and have not
been dealt with yet. It sits under **ホーム** / **Home** in the sidebar, above
**ライブラリ** / **Library**. The number beside it is how many arrivals are still open in
the drive you are in; it is hidden at zero and shows `99+` above 99.

Files stay where they landed. The inbox is a list beside them, not a folder, so moving or
deleting a file still happens in its own folder.

## What arrives

- Every upload made from Litloft: the upload zone, drag and drop, **Add → Upload files**,
  a dropped folder (one arrival per file), and the upload zone on the inbox page itself.
- Files, notes and links shared to Litloft from the iOS app's share menu, and web clips
  saved by the knowledge addon. A share is labelled **共有** / **Shared**; a web clip is
  **Web クリップ** / **Web clip**.

Scans, copies, Quick Note, a new note, attachments uploaded from inside an editor, and
files added outside Litloft do not arrive. On the inbox page, dropped files land in the
drive root.

## What closes a row

- **済み** / **Done** on a row, on a selection, or **すべて済みにする** /
  **Mark all done**.
- Moving the file inside its drive, moving it to another drive, or putting it in the
  trash.
- Changing the file's tags. Re-saving the same tags does not close it.

Opening a file, playing it, renaming it, moving its folder, copying it, commenting,
liking, favouriting, or restoring it from the trash leaves the row as it was.

**元に戻す** / **Undo** on the toast after **済み** reopens the rows that were just
closed. The toast lasts five seconds.

## Working through the inbox

Rows are grouped by your local date: **今日** / **Today**, **昨日** / **Yesterday**, and
**それ以前** / **Earlier**. Each row shows the file's thumbnail, its name, where it came
from, when it arrived, the folder it is in, and its ingest stage:

- a stage that is still pending or running shows its label and a spinner;
- **使えます** / **Ready** with a check means the file is usable;
- **確認できません** / **Not available right now** means an addon could not be reached;
  the row is not retried on a timer, though an update from that addon still refreshes it;
- a failed step adds a warning mark beside the label, **Ready** included.

The next 100 rows load when you reach the end of the list.

### With a mouse

- Hover a row, or tab into it, to reveal its **済み** button; every row also has a
  checkbox.
- Right-click a row for the usual file menu.
- Click a row to open the file with the inbox's own previous / next order. Close the file
  to come back to the inbox.

### With touch

- Swipe a row to the left, past a third of its width, to mark it done. A shorter swipe
  springs back, and a mostly vertical gesture scrolls.
- Press and hold a row for half a second to start selecting. While selecting, tap rows to
  add or remove them; the selection bar's **×** ends selection.
- On a screen at least 768 px wide, the **済み** button is always visible on touch.

With rows selected, the bar offers **済み**, **移動** / **Move**, and **タグ** / **Tag**.
Moving and tagging send at most 100 files per request.

## From a file's page

A file opened from the inbox keeps `nav=inbox`, so the previous / next arrows walk the
arrivals in inbox order. Its **済み** button closes the arrival and moves to the next one,
or back to the inbox when it is the last.
