# The index widget names the YouTube row after what it does

SPEC-ID: SPEC-ADDON-178

Approval: sha256:32d07250f7fb77edea5380b6f10f25a57992f9c45464f9eba09e9a9491ec6136 Yuichi Senga 2026-11-23

## Summary

The intelligence index widget shows the `loft_media` task as 「YouTube の取得」 /
"YouTube fetch". The task downloads a YouTube reference's video without audio, reads
its scene frames, change scan and on-screen text, and deletes the download, so nothing
is kept. "Fetch" reads as keeping the video. The row is renamed 「YouTube の映像解析」 /
"YouTube video analysis", for the owner reading the dashboard. This replaces the label
named in SPEC-ADDON-117 item 1.7; nothing else about the row changes.

## Required items

### 1. Normal flow

The viewer opens a page with the index widget. The `loft_media` row is drawn where it is
today, after the Scene change scan row, with the same icon and counts, and its label is
「YouTube の映像解析」 under the `ja` locale and "YouTube video analysis" under `en`.

### 2. Failure cases

None: the label is a static message string. A missing key would fall back to next-intl's
key display, which the message files rule out.

### 3. States

None new. The row's visibility and counts follow the same task states as before.

### 4. Data read and written

Read: `addons/intelligence/frontend/messages/{ja,en}.json` at build time (merged into the
frontend's generated messages). Nothing is written.

### 5. External services

None: the label is not fetched.

### 6. Authorization

None: the widget's visibility rules are unchanged.

### 7. Effect on existing features

Only the row label. The task type name `loft_media`, the `/status` keys, the log line
`loft_media backing off`, and the fetch directory `loft_media/` keep their names.

### 8. Error behavior

None: no new failure path.

### 9. User-visible behavior

The row label changes from 「YouTube の取得」 to 「YouTube の映像解析」 (`ja`) and from
"YouTube fetch" to "YouTube video analysis" (`en`). Position, icon, counts and timing are
unchanged. `docs/addons/intelligence.md` names the row by its new label.

### 10. Non-functional

None: a string change has no size, time, concurrency, privacy or cost effect.

## Touch points

- `addons/intelligence/frontend/messages/ja.json` (`semanticSearch.tasks.loft_media.label`)
- `addons/intelligence/frontend/messages/en.json` (same key)
- `addons/intelligence/frontend/IndexStatusWidgetLoftMedia.test.tsx` (the label-value test is deleted; the row test finds the row through the message key instead of a literal label, cites SPEC-ADDON-178 as the test for I1 besides SPEC-ADDON-117, and the header sentence stating the old label is deleted)
- `docs/addons/intelligence.md` (the paragraph that names the row)
- `addons/intelligence` submodule pointer in the core repository

## Invariants

I1. While the queue has `loft_media` tasks, the index widget draws them in one row placed right after the Scene change scan row, with the lucide `Download` icon, the row's label taken from the `semanticSearch.tasks.loft_media.label` message, and the processing file's name in it.

## Checked, no action

- No test pins the label's wording. A test that a message file holds a given string only
  shows that this change landed; a wrong label is seen at once on the dashboard. The test
  asserting 「YouTube の取得」 / "YouTube fetch" is deleted, with the owner's agreement,
  rather than updated to the new strings.
- The `Download` icon: the task does download the video, and the icon is not what the
  owner read as "kept". Changing it is not asked for.
- Internal names (`loft_media` task type, `loft_media/` directory, the `loft_media backing
  off` log line, test and spec titles that say "YouTube fetch"): operator- and
  developer-facing, not shown in the widget. Renaming them would touch logs operators may
  grep for and is not asked for.
- Earlier specs (`youtube-full-pipeline.md`, `loft-fetch-pacing.md`,
  `scene-frames-ten-second-fill.md`) quote the old label. Approved specs are not edited;
  this spec supersedes the label they name.
- SPEC-ADDON-117's invariants do not name the label, so there is no `## Revises`.
