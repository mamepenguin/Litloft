# Notes

**Notes** in the sidebar gathers the Markdown and text files of the current drive, so you can reach them without walking the folders. It needs the [Knowledge addon](../addons/knowledge.md). The notes are ordinary files in ordinary folders. Web clips are not listed here; they have their own **Clips** page in the sidebar.

The page has a **Target** menu, **New note**, and two tabs: **Home** and **Library**. The count beside the drive name is the number of notes in the current target.

## Target

The Target menu narrows everything on the page, on both tabs, to **All notes**, a collection, or a Smart Collection. It works as in [Reading](reading.md#target); the choice is remembered for the drive. Continue writing on Home ignores it, because it lists what you opened.

## Home

- **Continue writing** shows the four notes you opened most recently. It appears only when you have a [profile](profile-preferences.md).
- **Notes with sources** shows up to five recently updated notes that cite a file, each with the first source's thumbnail. When the note cites a video position or a document page, a badge on the thumbnail shows it (`1:23`, `p. 4`). Only the target's newest notes are checked, so an older note that cites a source may not appear. The section is hidden when there is nothing to show.
- **Recently updated** shows the five most recently changed notes. **See in Library** opens the Library. Adding a tag or a favorite counts as a change.

## Library

The Library lists the notes of the target and shows the chosen note beside the list.

- **Folders** or **Tags** (the switch at the top of the rail, remembered for the drive) chooses how the rail classifies the notes. Choose an entry to list its notes: a folder lists the notes directly in it, not in its subfolders, and **All** lists every note. Each entry shows its note count. The rail shows at most 200 entries.
- The search field above the list matches titles and folder names, not the text inside notes. Press Enter to search. It searches within the chosen entry.
- **Sort** orders the list by **Updated**, **Title** or **Created**.
- More notes load as you scroll to the end of the list.

What is drawn depends on the window width:

| Width | Layout |
|---|---|
| 1280 px and wider | The rail, the list and the note, side by side. |
| 1024 to 1279 px | The rail becomes a menu above the list. The list and the note are side by side. |
| Under 1024 px | The rail and **Sort** are menus above the list. Choosing a note opens its file page. |

Folders are moved and renamed in the file browser, not here.

### The note beside the list

Choosing a note shows it beside the list, with its folder, update time and tags. Choosing another note, a folder, a tag, or another tab replaces it. If the note was in a folder or tag you left, or is not in the target, the first note of the list is shown instead.

- **Edit** opens the editor in place. It is not offered for a file that cannot be edited here, such as a `.txt` file the editor does not take, or when the editor is off for the drive. **Done** saves and returns to reading. While you edit, the text is saved automatically.
- The arrow button opens the note's file page.
- Under the note, **Related files** and **Sources** list its connections. A source opens at the cited position. **See this note in the graph** opens the [connections graph](../addons/knowledge.md#connections-graph) centred on the note.
- The view-mode shortcut does nothing here; the pane has no Split or Preview.

### Leaving a note you are editing

Choosing another note, folder, tag, sort, tab or Target, or opening the file page, saves the text first and then moves on. If the save fails (**Couldn't save**) or the note changed elsewhere (**Changed elsewhere**), you stay on the note, and a dialog offers **Discard and navigate**. Choosing it drops the unsaved text.

## Writing a new note

**New note**, at the top right, opens [Quick Note](quick-note.md) with this drive already set as the destination, and in the Library the chosen folder. Nothing is created until you save.

## Jumping to another note

While a note is open, `Cmd/Ctrl+K` opens search limited to this drive's notes. Type part of a title or folder and press Enter on a result. To search the whole drive instead, press × on **Notes** or `Backspace` in the empty field. See [narrowed to one kind](search.md#narrowed-to-one-kind). `Enter` with no result chosen opens the Library with your query in its search field.

## Clips

**Clips** in the sidebar is the page for web pages you saved. It has the same header as Notes: a **Target** menu, **Clip a web page** at the top right, and the tabs **Home** and **Library**. The count beside the drive name is the number of clips in the current target. The Target menu works as on Notes, and its default, **All clips**, counts clips only.

- **Home** has the shelves **Unread**, **Recently opened** and **Unverified**. Without a [profile](profile-preferences.md), **Unread** becomes **New clips** and **Recently opened** is not drawn. **Recently opened** does not follow the Target. A shelf with nothing in it is not drawn. **See all** beside a shelf opens that shelf as a page of its own, with a link back to Home or the Library.
- **Unverified** lists clips that are not yet a trusted source, one row each. **Mark as verified** on a row marks that clip as a trusted source, the same as **Trust as a source** on its file page, and the row leaves the shelf. If it cannot be saved, **Couldn't save** appears beside the button and you can press it again.
- **Library** has two menus: **By tag** (one shelf per tag, the most used first, **Untagged** last) or **No grouping** (every clip in one grid), and the order, **Newest clipped**, **Oldest clipped** or **Title**. More shelves or cards load as you scroll to the end.
- A clip is a card: its first picture, the title, then the site it came from and a reading time. Home and shelf pages add how long ago it was clipped. A red dot marks a clip you have not opened. Choosing a card opens the clip's file page.
- A clip with no picture shows a plain grey block, and so does one whose picture does not load. The site is the host of the clip's `url`, or failing that of the first link in the start of the page.

A clip's first picture is either a file in the drive or an image on the source site. In the second case your browser loads it from that site when the card is drawn, without telling the site which page it came from. A site that is slow or refuses leaves the grey block; the clip itself is not affected.

A drive with no clips shows **No clips yet** and nothing else. A Target with no clips shows **No clips in this Target**.

## Web clips and connections

Save a web page from the **Clips** page, from **Clip web page** in the **Add** menu, or with the bookmarklet. Clips stay out of Notes, including its count, until you delete `origin: webclip` from their frontmatter. The connections graph of the whole drive is not linked from Notes; open it from **See this note in the graph**, or from the **Related** tab of a Markdown or text file.
