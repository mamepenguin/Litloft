# Drives and access control

A *drive* is one library in Litloft, such as *Movies* or *Photos*. Each drive is separate: search, favourites, tags and watch history never mix two drives.

Drives are added and named by whoever runs Litloft, in the [setup wizard](../getting-started/first-run-setup.md) or the [settings screen](../admin-guide/settings-gui.md). The file format is in the [configuration reference](../reference/configuration.md).

## Moving between drives

The start page, **Litloft**, shows a card for each drive you can open.

Inside a drive, the first row of the sidebar names the drive you are in. Press it to see the others and pick one. On the start page and the dashboard the same row reads **Drives (N)**. With only one drive, the drive is listed directly.

## Locked drives

A drive can be protected by a password. Until you unlock it, a protected drive is hidden completely: it is not listed, it is not in search, and a direct link to it shows *not found*.

If any drive is still locked for you, the start page ends with an **Enter password** card. It does not say which drives are behind it.

## Unlocking

1. Press **Enter password** on the start page, or go to `/unlock`.
2. Type the password and press **Unlock**.
3. Tick **Remember this device** to stay unlocked for a year. Otherwise the unlock lasts 24 hours.

One password can unlock several drives, and several passwords can unlock the same drive.

## Locking again

Press **Lock** at the bottom of the sidebar. It locks every drive you unlocked on this device. Clearing the browser's cookies does the same.

If the administrator changes or removes a password, devices that already unlocked with it stay unlocked until their unlock expires. See the [admin dashboard guide](../admin-guide/admin-dashboard.md) for how to sign out every device.

## Administrators

You are an administrator if your password unlocks every protected drive. When no passwords are set, everyone is an administrator.

An administrator sees **Dashboard** under **Administration** at the bottom of the sidebar. From there, **Settings** edits drives, passwords and addons for each drive. See the [admin guide](../admin-guide/admin-dashboard.md).

## Changes that need a restart

Adding, removing or renaming a drive, and some addon changes, take effect only after the backend restarts. The dashboard then shows **Pending changes — restart required** with the command to run.
