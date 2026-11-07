# Video

**動画** / **Video** is a page of its own for the videos of one drive. It sits in the
sidebar right after **ライブラリ** / **Library** and before the rows that addons add
(Notes, Ask). It is selected only on its own pages, so Library is not lit while you are
here.

The header shows the drive, how many videos are under the current target, and a **Target**
button. Two tabs under it switch the page between **発見** / **Discover** and
**ライブラリ** / **Library**. Litloft remembers, per drive, which tab you used last, and it
opens there.

## Discover

Up to three shelves of 12 videos, each loading on its own:

- **Continue**: videos you started and have not finished, most recently played first.
  A bar along the bottom of the thumbnail shows how far you got.
- **Recommended**: a random sample of videos you have not watched. The sample stays while
  you switch tabs and back; reloading the page draws a new one. A video you only opened
  without playing counts as not watched and can come up again.
- **New**: the most recently added videos.

A shelf with no videos is not shown. If one shelf fails to load, only that shelf shows
**Retry**.

## Library

**Classification** chooses how the drive's videos are grouped into shelves, and the sort
menu next to it orders the videos inside each shelf: added newest first (the default),
added oldest first, title, or size. Each shelf shows its name, how many videos it holds and
its first five; **See all** opens that shelf as a grid, 60 videos at a time, with the same
target and sort. More shelves load as you scroll.

| Classification | Shelves |
|---|---|
| **Folder** (default) | One per top-level folder. Videos at the root of the drive are under the drive's name. |
| **Tag** | One per tag, most videos first. A video with several tags is in each of them. Videos with no tag are in **No tag**. |
| **Month added** | One per month, newest first. Months are counted in UTC, so a video added late in the evening can land in the next month. |
| **Length** | Under 10 min, 10 to 30 min, 30 min or more. A video whose length is unknown is in none of them. |
| **Watch state** | In progress, Unwatched, Finished. |

## Target

**Target** chooses which videos the page works on. **All videos** is every video in the
drive. Any of the drive's smart folders can replace it; the page then shows only the videos
that smart folder matches, and the choice is remembered for the drive. A smart folder's own
sort is not used here.

- A smart folder that matches no videos (for example one limited to images) can still be
  chosen. Every tab then shows the empty state.
- A smart folder that has been deleted is replaced by **All videos** without a message.
- If the smart folders cannot be loaded, the menu offers only **All videos**.

## Without a profile

Watch history is stored against a profile (see [Profile and preferences](profile-preferences.md)).
With no profile set:

- **Continue** is not shown, because there is no history to read.
- **Recommended** is a random sample of all videos under the target, since there is no
  watched or unwatched to tell apart.
- **Watch state** is not offered under **Classification**. If you had chosen it earlier,
  the page shows Folder meanwhile and it comes back when you set a profile.

Setting or clearing a profile takes effect on the page without a reload.

## A folder named `apps`

The page lives at `/drive/<drive>/apps/video`, so a folder named `apps` at the root of a
drive cannot be opened at `/drive/<drive>/apps`, in the same way as a root folder named
`search`.
