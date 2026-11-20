# Video

**動画** / **Video** is a page of its own for the videos of one drive. It sits in the
sidebar right after **ライブラリ** / **Library** and before the rows that addons add
(Notes, Ask). It is selected only on its own pages, so Library is not lit while you are
here.

The header shows the drive, how many videos are under the current target, and a control
showing the target's name with a target icon: at the title row's end, or under the title on
a phone. Two tabs under it switch the page between **発見** / **Discover** and
**ライブラリ** / **Library**. Litloft remembers, per drive, which tab you used last, and it
opens there.

## Discover

Up to five shelves with the standard addons, in this order: **Continue**,
**Recommended**, the addon shelves, then **New**. They are drawn from the top down:
while the page loads, one placeholder shelf sits under the shelves already shown, and
nothing above it moves.

- **Continue**: videos you started and have not finished, played within the last two weeks,
  most recently played first. A file set aside from **Continue** on Home does not appear
  here. A bar along the bottom of the thumbnail shows how far you got.
- **Recommended**: up to 12 videos you have not watched yet, ranked by your history
  in the drive. Here a video counts as watched once you have played at least half
  of it, or liked it or marked it as a favourite, so a video you only glanced at
  can still be recommended. It needs a profile and the Intelligence addon with a
  Pickup feed, and it is absent when there is no suggestion for the current target.
  It is not a random sample. Among videos that match equally, newer ones come
  first, and the picks can change during the day while new videos are being added.
  To drop a suggestion you do not want, right-click its card (or long-press it on a
  touch screen) and choose **Not interested**; **Undo** in the notice brings it back.
- **Addon shelves**: Media Import adds **よく見るソース** / **Regular sources** and
  **購読の新着** / **New from subscriptions**, for the subscriptions you chose to show.
- **New**: the most recently added videos.

A shelf with no videos is not shown. If Continue or New fails to load, only that
shelf shows **Retry**. A Recommended or addon shelf that fails or comes to nothing
is simply absent, with no Retry. A Recommended or addon shelf slower than about a
second can be missing the first time and appears the next time you open Video in the
same tab that day.

**See all** appears on each shelf that has one: **Continue** opens the Continue desk,
**New** opens all videos newest first, and an addon shelf opens its addon page when the
addon offers one. An addon shelf whose addon supplies a page provider opens a page in the
video app instead, under the same target (type and Smart Collection) as Discover, and more
videos load as you scroll. **Recommended**'s **See all** opens a page in the video app
under the same target, listing the recommended videos you have not watched yet. The shelf page shows 60
videos at a time, except Recommended's, which shows all of them at once. **Continue**'s
page opens most recently played first, with **最後に開いた日** /
**Date Last Opened** in its sort menu.

## Library

**分類** / **Group By** chooses how the drive's videos are grouped into shelves, and
**並び順** / **Sort By** next to it orders the videos inside each shelf or grid: **追加日
（新しい順）** / **Date Added (Newest First)** (the default), **追加日（古い順）** /
**Date Added (Oldest First)**, **タイトル** / **Title**, or **サイズ** / **Size**. Each
shelf shows its name, how many videos it holds and its first five; **See all** opens that
shelf as a grid, 60 videos at a time, with the same target and sort. More shelves load as
you scroll.

| Grouping | Shelves |
|---|---|
| **フォルダ** / **Folder** (default) | One per top-level folder. Videos at the root of the drive are under the drive's name. |
| **タグ** / **Tag** | One per tag, most videos first. A video with several tags is in each of them. Videos with no tag are in **タグなし** / **No tag**. |
| **追加日** / **Date Added** | One per month, newest first. Months are counted in UTC, so a video added late in the evening can land in the next month. |
| **長さ** / **Length** | Under 10 min, 10 to 30 min, 30 min or more. A video whose length is unknown is in none of them. |
| **視聴状態** / **Watch State** | In progress, Unwatched, Finished. |
| **なし** / **None** | One grid of every video under the target, 60 at a time, loading as you scroll. |

The grouping and the sort are remembered for each target in this browser, so a Smart
Collection can open grouped by tag while **All videos** opens grouped by folder. A target
you have not configured opens on Folder and Date Added (newest first). **All videos**
opens on the grouping the drive used before this change, so upgrading shows the same
shelves as before.

## Target

The target control shows the target's name with a target icon, at the title row's end or
under the title on a phone. It chooses which videos the page works on. **All videos** is
every video in the drive. A collection or a Smart Collection can replace it; the page then
shows only that target's videos, and the choice is remembered for the drive. A Smart
Collection's own sort is not used here.

The menu lists **All videos**, then the collections and Smart Collections you chose to
show, by name, then **管理…** / **Manage…**. **Manage…** opens a searchable list of both
kinds; tick the ones you want in this menu. The set is kept per app and per drive, so
Video and Reading keep separate lists. A new collection or Smart Collection stays out of
the menu until you tick it there; a shown set you saved before collections could be targets
starts with every collection unchecked.

- A collection is always usable as a target: the page shows the videos it holds.
- A Smart Collection that matches no videos (for example one limited to images) can still be
  chosen. Every tab then shows the empty state.
- A Smart Collection whose query has search text (a word, or a condition written with `-`
  or `!`) lists the videos among the files that Smart Collection's search page lists. One
  whose search page matches more than 10,000 files cannot be used as a target: the page
  shows **この対象は使えません** / **This target cannot be used** and asks the server for
  nothing.
- If a Smart Collection's files cannot be worked out, the page shows **Retry**.
- A Smart Collection the page cannot use is listed disabled.
- A Smart Collection that has been deleted is replaced by **All videos** without a message.
  The same holds for a collection.
- If one of the two lists cannot be loaded, the menu offers **All videos**, the other
  list's entries and **Manage…**; the Manage list shows a retry that asks again for the
  list that failed.

## Without a profile

Watch history is stored against a profile (see [Profile and preferences](profile-preferences.md)).
With no profile set:

- **Continue** is not shown, because there is no history to read.
- **Recommended** is not shown: it needs a profile to know what you have watched.
- The addon shelves still appear, because they do not need a profile.
- **Watch State** is not offered under **Group By**. If you had chosen it earlier,
  the page shows Folder meanwhile and it comes back when you set a profile.

Setting or clearing a profile takes effect on the page without a reload.

## A folder named `apps`

The page lives at `/drive/<drive>/apps/video`, so a folder named `apps` at the root of a
drive cannot be opened at `/drive/<drive>/apps`, in the same way as a root folder named
`search`.

## Watching a video

On a video's own page, the ruler in the **Scenes** panel shows the video's frames along
its length. Hovering the ruler, or touching it on a phone, shows the frames there without
moving the video. A click on the ruler, or a tap on a frame, plays from that point.

The thin band above the seek bar, and the bars on Continue and Recently viewed cards, fill
the parts you have already watched; only continuous playing of 10 seconds or more is
recorded. The jump button and `P` go to the parts you played most, and appear once you
have replayed a part.
