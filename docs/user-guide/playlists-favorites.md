# Collections, favourites and likes

Three lightweight ways to keep things you want to revisit.

## Favourites and likes

Both mark a file, and each has its own list, but they answer different
questions. The difference is one of tense.

| | Favourite (star) | Like (thumb) |
|---|---|---|
| Means | **Open this again.** Working shelf | **This was good.** A record of something you already read or watched |
| Churn | High — taking things off is expected | Low — it accumulates |
| Press it from | A file's viewer page, or hover on any card in the grid | Its viewer page only |
| Stored as | `is_favorite`, a flag | `liked_at`, the time you liked it |
| Its list | *Favourites* in the sidebar and on the drive home | *Liked* in the same two places, ordered by when you liked each file |

Liking a file you already liked clears the mark; liking it again later
records the new time, so a file you come back to returns to the top of
*Liked* rather than keeping the date you first pressed it.

- Both are **per drive**, not per viewer. If you share a Litloft installation, marking a file affects what everyone sees.
- Neither affects search ranking.

If you want viewer-private favourites or likes, that is a feature request —
currently the model is shared.

## Collections

A **collection** is an ordered list of files within a single drive.

![Collection editor with a row being reordered by drag and drop](../images/user-guide/playlist-reorder-drag.png)

- Create a collection from the drive sidebar or from the file viewer (*Add to collection*).
- Collections are **drive-scoped**: a file belongs to exactly one drive, and a collection can only contain files from its own drive.
- A file can appear in multiple collections.
- The order is editable: drag-and-drop within the collection editor.
- **The list view numbers the rows**, from 01. A collection's order is the collection, unlike a folder's, which is whichever sort you last chose — so the numbers say where you are in it. They count positions in the list you are looking at, so reordering renumbers from 1 rather than leaving gaps.
- Which view a collection opens in follows the same rule as a folder's ([file browsing](file-browsing.md#file-grid-and-list-modes)): a collection that is mostly audio or mostly unclassified files opens as a list, because a card of either can only draw the same icon. Anything you choose for a collection is remembered and keeps winning over that.
- **Deleting a collection** is in the `…` menu beside **Play**, named in full and in red. It used to be a bare bin icon next to Play, which put a destructive action one mis-aimed tap from the thing the page is for. Deleting still asks for confirmation, and still removes only the collection — the files stay where they are.
- An empty collection says so and offers a way out of it, rather than a bare "No items".

### What collections do

- The video and audio players honour the collection order: when one file ends and **autoplay** is on, the player advances to the next item.
- Theatre mode shows the collection queue alongside the player.
- A collection surface is available on the drive home page when at least one collection exists.

### Missing or deleted files in collections

If a file in your collection later goes **missing** (off-disk) or **trashed**:

- The item remains in the collection (it is not silently removed).
- The frontend renders it with a muted style and disables play.
- Restoring or recovering the file makes the collection item playable again.

Adding a missing or trashed file to a new collection is rejected (`active_file_filter()` excludes them at the API level).

### Sharing a collection

There is no built-in public sharing. Within a Litloft instance, every viewer who has access to the drive sees the same collections. To export, you can fetch the collection's items via the API:

```
GET /api/drives/<drive>/collections
GET /api/drives/<drive>/collections/<id>
```

…and reconstruct it elsewhere (filenames, file_ids, etc.).

### Common patterns

- **Watch later** — a single global *Later* collection where you stash anything you spot.
- **Channels** — one collection per recurring source (a podcast feed, a video creator's videos).
- **Topical** — *Cooking shows*, *Travel vlogs*; complements tag filters when the boundary is fuzzy.

## Pinned folders

A folder you pin is kept on the drive home page even if it has had no recent activity. Pins are per-drive and shared (same model as favourites).

- Right-click a folder → **Pin**.
- Click the pin icon on a pinned folder card to unpin.

## Smart folders

A *Smart Folder* is a saved search rather than a curated list. See [search](search.md#saving-as-a-smart-folder).

## Continue watching

Not user-curated, but a sibling concept: the *Continue watching* row on the drive home page lists files you have started but not finished. Backed by `WatchHistory` rows that have not passed 90% (`playback_position < duration * 0.9`). There is no lower bound: rows sit out naturally because a file you only opened records `0`, and `0 < 0` is false. See [comments and watch history](comments-history.md).
