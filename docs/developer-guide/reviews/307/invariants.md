# R-0 invariants: core fix/known-issues-setup-addons
1. The addon policy the wizard saves names only drives that exist in the drives it saves, under their final names.
2. An addon choice made for a drive is preserved when that drive is renamed at any later step, and is dropped when the drive is removed.
3. A rejected drives, passwords or policy save is shown to the user with its own cause (a drives failure is not reported as a policy error); the wizard never shows the finished state after a failed save. (revised after round 1: cause named)
4. When /api/addons/status fails, no summary line claims zero addons enabled, and nothing is saved that disables an addon.
5. When /api/addons/status succeeds, the addon step and summary behave as before (switches, counts, saved policy).
6. The wizard still completes (setup_completed written) for a first run with no addons installed.
7. After a failed save the user can correct the cause and finish without reloading. (added after round 1)
8. An addon whose switch was never touched stays omitted from the saved policy. (added after round 1)
9. A first run in password-protected mode completes, saves the entered password with its groups plus `__admin__`, and afterwards the protected drives are hidden (404) until unlocked and /admin requires that password. (added after round 2, F1)
10. `PUT` of passwords via /admin/settings accepts `__admin__` and still rejects any other group no drive declares. (added after round 2, F1)
11. After a successful Finish, passwords.json holds exactly what the wizard's final choice describes: `[]` for public mode, and exactly the entered password entry for protected mode — nothing written earlier (by another caller or by a previous failed attempt) survives. (added after round 3, F1)
