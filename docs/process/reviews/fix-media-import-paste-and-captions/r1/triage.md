# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: If /subscriptions/resolve fails, the Composer sends a channel URL to createLoft, both after a failed preview (cached as unknown at Composer.tsx:153) and at submit (Composer.tsx:181). The tests encode this behavior. The resolve route does pure parsing (router.py:291-301), so in normal use the failure mostly coincides with /link failing too, and I did not raise it as a finding.; A preview that answers after a successful submit still runs setKind and writes classified.current (Composer.tsx:143-144), so the empty composer can show Subscribe and the display-mode field until the next URL. The same stale setKind existed before this change. It affects display only, because submit now decides from its own classification.; classified.current is keyed by URL only, not by drive. The resolve route's classification does not depend on the drive, so a drive change without remount does not produce a wrong kind today.; A folder filled in by an earlier URL's preview stays selected for the next URL, and rememberFolder then writes it under the new kind (Composer.tsx:174, 205). decisions.md observed this. The folder-retaining condition is unchanged from the old code and the folder is visible in the picker.
- claude-read: If /subscriptions/resolve fails, the Composer sends a channel URL to createLoft, both after a failed preview (cached as unknown at Composer.tsx:153) and at submit (Composer.tsx:181). The tests encode this behavior. The resolve route does pure parsing (router.py:291-301), so in normal use the failure mostly coincides with /link failing too, and I did not raise it as a finding.
- claude-read: A preview that answers after a successful submit still runs setKind and writes classified.current (Composer.tsx:143-144), so the empty composer can show Subscribe and the display-mode field until the next URL. The same stale setKind existed before this change. It affects display only, because submit now decides from its own classification.
- claude-read: classified.current is keyed by URL only, not by drive. The resolve route's classification does not depend on the drive, so a drive change without remount does not produce a wrong kind today.
- claude-read: A folder filled in by an earlier URL's preview stays selected for the next URL, and rememberFolder then writes it under the new kind (Composer.tsx:174, 205). decisions.md observed this. The folder-retaining condition is unchanged from the old code and the folder is visible in the picker.

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-1 — bucket B, LOW, open

Claim: The caption file now always crosses a filesystem in production, through shutil.move's copy2 fallback, and no test exercises that path.
Impact: Refreshing captions on a drive where copying fails part-way (disk full) truncates the existing <title>.vtt in place, where the old same-directory rename could not. On a mount that refuses chmod or utime on the destination, the content is copied but copystat raises, so the caller records captions_downloaded false while a good .vtt is on disk.
Evidence: addons/media_import/backend/service.py:243 creates the scratch directory in the system temp location and service.py:264 moves from it to the drive. decisions.md records /tmp/mi_captions_*/captions.en.vtt inside the container, separate from the bind-mounted drive. The exception reaches service.py:968, which leaves captions_ok False. The tests in test_nfc_names.py use pytest tmp_path, normally on the same filesystem as tempfile's directory, so os.rename succeeds there and the copy branch does not run. _dedup_rolling_vtt (service.py:266) also rewrites the file afterwards, and I did not read how it writes, so the old code may have had a similar exposure at that later step.
Repro: not_reproduced; found by reading. Suggested check: patch os.rename to raise OSError(EXDEV) and make shutil.copystat raise PermissionError, then observe the (False/exception) outcome with a complete vtt_path on disk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Copy the file content to a temporary name in the destination directory with shutil.copyfile, then os.replace it onto vtt_path, so the old captions stay intact until the new file is complete and no chmod or utime is needed.

</details>

## Not verified

- claude-read: I ran no tests or mutations; this review has read-only tools, so the kill and survive statements come from reading the code.
- claude-read: I did not observe the behavior of shutil.move on a real cross-filesystem mount or on restrictive NAS mounts.
- claude-read: I did not read yt-dlp's source to confirm the subtitle filename; I relied on the path sampled in decisions.md (captions.en.vtt).
- claude-read: I did not read how _dedup_rolling_vtt writes its output, beyond its first lines.
- claude-read: I did not read Composer.test.tsx outside the diff, including its top-level mock reset and existing folder write-back tests, or the app-run artifacts cited by decisions.md.
- claude-read: I did not check whether a spec for this change is required or exists in docs/specs/INDEX.md.
- claude-verify: Nothing was executed: the EXDEV fallback, the tests and the filesystem layout of the test container were established by reading code and configuration, not observed.
- claude-verify: Behaviour on the production NFS-backed drive, including whether copystat's utime or chmod can fail there.
- claude-verify: The caption code at the base commit, so whether the old code had a similar exposure is unresolved.
- claude-verify: The actual docker-compose.override.yml used in production, which is gitignored; only the example file was read.
- claude-verify: The R-5 evidence files under the scratchpad path cited in decisions.md, and which code path the metadata refresh takes through manager.py:727 versus service.py:965.
- claude-verify: The rest of the commit, including the Composer paste changes.

TOTAL: 1 findings
