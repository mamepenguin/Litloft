# R-0 invariants: core fix/known-issues-backend-small
1. A caller without access to a drive (locked, or not configured) gets byte-identical `GET /api/addons/status?drive=` responses for both cases (status code and body); response time is not in scope.
2. A public drive, and a protected drive the caller has unlocked, return the same addon catalogue as before this change.
3. With passwords.json absent or `[]`, `addons/status?drive=` answers exactly as the drive endpoints decide access for that drive (a drive without access_group returns its catalogue); the no-drive form used by /setup and /admin/settings is unchanged. (revised after round 1: measured behaviour of check_drive_access)
4. An addon whose ADDON_META is not a dict, or whose scope (in ADDON_META or an external manifest.json) is a list, dict or other non-string value, is refused like any other invalid scope; other addons still load and run their startup hooks. (revised after round 1: F5, missing-4)
5. A valid scope ("drive" | "global" | "both") loads exactly as before.
6. (removed after round 1: tag item dropped from this PR; tag behaviour must equal develop)
7. (removed after round 1, with 6)
