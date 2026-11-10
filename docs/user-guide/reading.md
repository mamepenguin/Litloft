# Reading

**読む** / **Reading** is a page of its own for the books of one drive: PDF, EPUB and
archive files. It sits in the sidebar right after **動画** / **Video** and before the rows
that addons add. It is selected only on its own pages.

The header shows the drive, how many books are under the current target, and a **Target**
button. Two tabs under it switch the page between **発見** / **Discover** and
**ライブラリ** / **Library**. Litloft remembers, per drive, which tab you used last, and it
opens there.

## Discover

Up to three shelves of 12 books, each loading on its own:

- **続きを読む** / **Continue reading**: books you have started and not finished, opened
  within the last two weeks, most recently opened first. A book set aside from **Continue**
  on Home does not appear here. A bar along the bottom of the cover shows how far you got.
- **まだ読んでいない本** / **Not read yet**: a random sample of books you have not started.
  The sample stays while you switch tabs and back; reloading the page draws a new one.
- **新着** / **New**: the most recently added books.

A shelf with no books is not shown, and **Continue reading** is not shown without a
profile. Each shelf's **See all** opens it as a grid, 60 books at a time. **Not read yet**
has no **See all** without a profile. **Continue reading**'s page opens most recently
opened first, with **最後に開いた順** / **Last opened** in its sort menu.

Covers are portrait. The badge says **EPUB**, **PDF** or **書庫** / **Archive**, the title
runs to two lines, and the line under it is the book's folder (the drive name at the root)
and when it was added. Choosing a book opens its normal file page, where PDF and EPUB
reading, resume and history work as they do everywhere else.

## Library

The chip row at the top is **すべて** / **All** followed by the drive's book folders,
most books first. On a computer the chips wrap onto lines and the frame scrolls down when
there are more than three lines; on a touch screen they scroll sideways. Choosing a chip
narrows the page to that folder. It does not widen a target that is already limited to a
folder. The chip goes back to **All** when you reload, leave the page, come back from
**See all**, or choose another target.

Below the chips:

- **タグ** / **Tag** keeps only books carrying the chosen tags. Every chosen tag must be on
  the book. Under **By tag** it only chooses which books appear; the shelves still follow
  the books' tags.
- **状態** / **State** keeps **未読** / **Unread**, **読書中** / **In progress** or
  **読了** / **Finished** books. It needs a profile. With no profile the control is not
  drawn, and clearing the profile also clears a state you had chosen.
- **まとめ方** / **Group** is **なし** / **None** (the default) or **タグ別** / **By tag**.
  None is one grid of every matching book, 60 at a time, loading as you scroll. By tag is
  one shelf per tag, each showing its first books with **See all**; books with no tag are
  in a last shelf **タグなし** / **No tag**, and a book with several tags is in each of
  them. The choice is remembered for the drive.
- **並び順** / **Sort** is added newest first (the default), added oldest first, title or
  size. It orders the books inside every shelf and in the grid. It is not saved.

**See all** on a tag shelf opens that shelf as a grid, 60 books at a time, under the same
target, chips, tag and state, and with the sort you had chosen. The shelf page has its own
sort menu and its own **Target** button; choosing another target keeps the shelf.

## Target

**Target** chooses which books the page works on. **すべての本** / **All books** is every
PDF, EPUB and archive in the drive. A smart folder can replace it, and the choice is
remembered for the drive. A smart folder's own sort is not used here.

- The menu lists **All books**, then the smart folders you chose to show, then
  **管理…** / **Manage…**. **Manage…** opens a searchable list of the drive's smart
  folders; tick the ones you want in this menu. The set is kept per app and per drive. A
  new smart folder stays out of the menu until you tick it there.
- A smart folder the Reading page cannot use is listed disabled. This includes one whose
  kinds are not books (images, for example), one that filters by length, and one that uses
  a negated condition. It cannot be chosen.
- A smart folder whose kinds miss every book shows **この対象は使えません** / **This target
  cannot be used**, and the page asks the server for nothing.
- A smart folder that has been deleted is replaced by **All books** without a message. If
  the smart folders cannot be loaded, the menu offers **All books** and **Manage…**; the
  Manage list shows a retry.

## Empty states and failures

**本がありません** / **No books** means nothing matches the current target, folder chip, tag
or state. A shelf that fails to load shows **Retry** and the other shelves still draw. If
the cover of a book cannot be drawn, the card shows a placeholder and the book still
opens.

## Without a profile

Watch history is stored against a profile (see [Profile and preferences](profile-preferences.md)).
With no profile set:

- **Continue reading** and its **See all** are not shown.
- **Not read yet** is a random sample of all books under the target, since there is no read
  or unread to tell apart.
- **State** is not drawn. If you had chosen one, it is cleared, and the control comes back
  when you set a profile.

Setting or clearing a profile takes effect on the page without a reload.
