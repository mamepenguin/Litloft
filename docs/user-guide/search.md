# Search

Search looks inside one drive at a time. It never shows files from another drive.

Without addons, search matches file titles and folder names. With the [intelligence addon](../addons/intelligence.md) it also finds files by meaning: what is said in a video, what a picture shows, and the text inside documents.

## The search modal

Press `Cmd/Ctrl+K` or `Cmd/Ctrl+Shift+F`, or the search button in the header. See [keyboard shortcuts](keyboard-shortcuts.md#global).

Before you type, the modal lists **Recent files** (the files you opened lately in this drive, on any device where you use the same [profile](profile-preferences.md)), and then your **Recent searches** in this browser. Each recent search has one button that puts the term in the field without running it, and one that removes it.

Once you type, the modal shows the best matches and a **View all N results** row that opens the full search page. Use the arrow keys to pick a row and `Enter` to open it.

With the intelligence addon, the footer says **Also searching by meaning…** while the second set of results is on its way. When it arrives the list can reorder. The row you picked stays picked.

### Narrowed to one kind

With the Knowledge addon installed, opening the modal from a note's page narrows it to notes. A **Notes** chip appears before the query. Then:

- Only notes are listed, and only by name.
- `Enter` with no row chosen opens the full list of notes matching your query, **All notes**. The same list is linked at the bottom right of the modal.
- To search the whole drive instead, press the chip's `×`, or `Backspace` in an empty field. What you typed stays.

## The search page

The search page matches the title and the folder path, ignoring case. A title starts as the filename without its extension, so you can search by filename. If you change a file's title, search sees the new title. Descriptions are not searched.

Each result has a small badge saying where it matched, such as **Filename** or **Path**. **What the badges mean**, at the bottom of the search popup, explains them all.

Above the results:

- **Filter** narrows by file type, as in a folder. **Document** includes text files and PDFs.
- **Sort** offers **Relevance** (the default while searching) plus the usual folder orders.

To filter by tag, use the sidebar instead. See [Tag filtering](#tag-filtering).

## Saving as a Smart Folder

Click **Save as Smart Folder** beside the results heading and give it a name. It appears under **Smart Folders** in the sidebar, and the button becomes **Saved:** followed by the name, with **Update**, **Rename** and **Delete**.

- A Smart Folder keeps the query, the file type and the sort. It does not keep a tag.
- It always shows the files that match now, not the ones that matched when you saved it.
- Only the **Video**, **Image**, **Audio** and **Document** types can be saved. Use **Document** for Markdown and PDFs. Saving with another type shows an error.
- Everyone who uses the drive sees the same Smart Folders.

## Tag filtering

Click a tag in the **Tags** section of the sidebar. It filters the folder you are in and all its subfolders. See [tags and relations](tags-and-relations.md#tag-filtering-and-scope).

## Searching by meaning (intelligence addon)

With the intelligence addon enabled for the drive, results found by meaning are mixed into the same list. There is no separate mode.

![Search page with semantic search and scene search enabled, showing timestamped results](../images/user-guide/search-semantic-scene-results.png)

- The badges also show matches in **Transcript**, **Content**, **Visual**, **Thumbnail** and **Metadata**.
- A match in speech or in a scene shows up to three timestamps. Click one to play from that moment. `+N` says how many more there were.
- A match in a PDF lists the pages, as `p.N`. Click one to open the PDF at that page.
- A match in text shows one quote from the file. With the [Knowledge addon](../addons/knowledge.md), a button beside it adds the quote to the capture basket for a note.

### Scene search

To find a moment inside a video (*the part where the cat jumps off the table*), turn on **Scene search** above the results. It is off by default because it adds noise to ordinary searches.

## Ask and Find (intelligence addon)

**Ask** is in the sidebar when the intelligence addon is installed and an administrator has set up a language model. Type a question and it answers from your files, with links to its sources and timestamps for videos. It warns you when it found no strong source. Ask answers only from [verified files](file-browsing.md#trusted-sources-and-the-review-queue).

![Ask answer pane with source citations and a no-strong-source warning](../images/user-guide/ask-answer-citations-warning.png)

**Find**, the tab beside Ask, returns a list of files for your question instead of a written answer. While you are searching, the **Find** chip in the search page header sends your query there.

Ask sends parts of your files to the language model. An administrator can use a local model, or turn Ask off for a drive. See the [intelligence addon](../addons/intelligence.md#ask-rag).

## Duplicate files

The admin dashboard has a **Duplicate Files** section. Pick a drive to see files with identical content. Choose the copy to keep, and the others go to the [trash](trash-and-missing.md).

For scripting search, see the [HTTP API reference](../reference/api.md).
