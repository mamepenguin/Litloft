# P4-1: addon policy switches show what the backend enforces — R-0 invariants

The backend decides an addon is on for a drive with
`config.is_addon_feature_enabled(drive, addon, "index")`: no drive entry, no
addon key, or a dict without `index` is on; `false` or `{index: false}` is off.
A feature is on unless the value is `false` or the dict holds `feature: false`.

1. For every drive × addon, the switch in `/setup` and in `/admin/settings` is On
   exactly when the backend treats that addon as on for that drive, for each of
   these stored shapes: no drive entry, no addon key, `true`, `false`, `{}`,
   `{index: false}`, `{index: true}`, `{editor: false}`,
   `{index: true, editor: false}`.
2. For every drive × addon × declared feature, the feature switch in
   `/admin/settings` is On exactly when `is_addon_feature_enabled` is true for
   the same shapes.
3. Finishing `/setup` without touching a switch leaves every drive's `addons` in
   `drives.json` as it was; every addon stays on and is shown On.
4. Pressing an addon switch once stores the opposite of what was shown for that
   drive × addon (`false` after On, `true` after Off); every other drive's and
   addon's stored value is unchanged.
5. `/setup`'s summary counts exactly the drive × addon pairs shown On.
6. A failed save in `/admin/settings` puts the switches back to what they showed
   before the press (unchanged behaviour).
7. The frontend and the backend reading of a stored shape are checked against one
   declared table by both test suites; changing either reading without the table
   fails a test.

Out of scope, declared: pressing an addon switch whose stored value is a dict
replaces the dict with a bool and loses its feature map (pre-existing; ledger).

## Revised by the supervisor after r1

8. The addon step offers Skip only while nothing is stored for the drives it
   shows, and pressing Skip stores nothing.
