# Viewers and players

Opening a file shows its page. Every kind of file uses the same page: the path at the top, the viewer in the middle, and the **inspector** down the right-hand side. A file Litloft cannot show, such as a spreadsheet, gets the same page with a *cannot be shown* panel where the viewer would be.

## The page row

The row at the top shows the path from the drive down to the file. Every step above the file is a link, so this is how you go back up. On a phone the path shrinks to `‹ folder name`.

Controls for the kind of file sit to its right (a Markdown note puts its save indicator and **Edit / Split / Preview** switch there). The inspector toggle is last.

During collection playback the row also keeps a way back to the collection you were playing.

## The inspector

The top of the inspector stays in place while the rest scrolls. It holds the title, one fact about the file (see [the table in *Browsing files*](file-browsing.md#file-grid-and-list-modes)), the like, favourite, **AI** and `⋮` buttons, and the tags.

Below it are tabs, shown only when there is more than one:

- **Info**: EXIF where the file has it, comments, and addon sections such as AI summaries.
- **Related**: the file's relations, and similar files with the intelligence addon.
- **Chapters**: on media with chapters.
- **Transcript**: on media that has one (intelligence addon).
- **Pages**: the contents and page thumbnails of a PDF, or an index of an archive.

A tab appears only when it has something in it, so a video that was never transcribed has no Transcript tab.

AI sections (intelligence addon) appear once they have been generated. To generate one, use the **AI** menu in the inspector.

Open and close the inspector with the toggle at the end of the page row, or `Cmd/Ctrl+\`. When the window is too narrow for both, it covers the right side of the page.

### On a phone

The inspector is a bottom sheet. While it rests, a strip along the bottom shows the file's name with like, favourite and `⋮`. Raise the sheet with the toggle or by dragging its handle; the full set of buttons is at the top of the sheet.

- Dragging anywhere else in the sheet scrolls it. Once you are at the top of the sheet, pull down or press `Esc` to send it back to the strip.
- The page above stays usable while the sheet is up: you can pause and seek the video.
- On a video, the sheet first rises only to the bottom of the player, so the whole picture stays visible.
- The tab strip sticks to the top of the sheet once you scroll down to it.
- The video player sticks to the top of the page as you scroll.

## Chapters and the transcript, beside or below

On video, audio and `.loft` files, a button in the page row decides where the chapters and the transcript go:

- **Beside** (the default): as tabs in the inspector, next to the player. Choosing it opens the inspector. If the window starts with the inspector closed, the panels are in there; open it to see them.
- **Below**: under the description, with the chapter list beside the transcript.

The button appears only when the file has chapters or a transcript. On a phone both always go into the bottom sheet. The choice is remembered on the device.

## Chapters

Click a chapter to jump to it. The chapter you are in is highlighted, and collapsing the list leaves just its name.

Chapters come from the file itself, from a `.loft` import ([media_import addon](../addons/media-import.md)), or from **AI chapter candidates** in the intelligence addon, which you approve or dismiss. Once you approve a set, a rescan does not replace it. There is no chapter editor.

## Timestamps in a description

On a video or audio file, timestamps in the description you wrote (`⋮` → **Edit**) become links that jump the player there. They can be `M:SS` or `H:MM:SS`, anywhere in the text. A time longer than the file stays plain text.

## Video player

![Video player with hover preview, subtitles menu, and autoplay controls](../images/user-guide/video-player-subtitles-preview.png)

Litloft draws its own control bar over the video. It looks different with a mouse and on a touch screen.

- Gestures: on touch, tap to show the controls, double-tap the left or right half to skip 10 s (keep tapping to skip further), press and hold to play at 2x, and swipe up or down or pinch for full screen. With a mouse, click to play or pause and double-click for full screen. See [keyboard shortcuts and gestures](keyboard-shortcuts.md).
- **Settings**: subtitles and playback speed, plus **Picture-in-Picture**, **Autoplay** (off by default), a subtitle track picker when there is more than one, and **Browser controls**. On an iPhone there is also **Open in the iOS player**.
- **Browser controls** hands the video to the browser's own bar, which is where AirPlay lives. **Use Litloft controls**, under the player, switches back.
- **Subtitles**: put `movie.srt` or `movie.vtt` next to `movie.mp4`, or `movie.en.srt`, `movie.ja.vtt` and so on for several languages. They load automatically, for `.loft` files too, and do not appear in the file list. Without one, the intelligence addon's generated track is offered.
- Resume: a video starts where you left off. A link with a time in it, such as an Ask citation, starts there instead.
- Mini player: on a computer, scrolling the video out of view shrinks it into a small window at the bottom right. It has only play, time, mute and seeking; set speed and subtitles before you scroll away, or restore the full player.
- The lock screen and media keys control playback, including next and previous in a collection.
- **Cast**: a Chromecast button appears when one is found.

In the [iOS app](ios-app.md), leaving the app moves the video into picture-in-picture, and there is no mini player.

## Audio player

Audio uses the browser's own player bar, with Cast and **Autoplay** below it. It resumes where you left off, and the lock screen shows the file's title and thumbnail. In the [iOS app](ios-app.md) audio keeps playing with the screen locked, and Litloft shows its own play, seek and speed controls.

## Image viewer

An image's page has **previous / next** buttons in the page row, which walk the images in the folder in the order the listing used. When you came from the plain folder listing, the image's place (`12 / 995`) is shown between them.

The maximise button opens the full-screen viewer, which turns through the folder's images.

![Image viewer in two-page spread mode with right-to-left reading enabled](../images/user-guide/image-viewer-spread-rtl.png)

- Turn the page: swipe (right always means next), tap or click the left or right edge, or use the arrow keys. A mouse drag does not turn the page.
- Controls: tap the centre. They hide themselves after two seconds; move the mouse or tap to bring them back.
- Zoom: pinch, Ctrl/⌘ + scroll, or `=` / `-`, up to 4x. `0` shows the whole picture. While zoomed, drag to move around; swipes and edge taps no longer turn the page.
- **Slideshow**: the play button, with an interval of 3, 5 or 10 seconds.
- **Spread**: reads the images as a book. A wide page is shown one half at a time (`3 / 190 A`, then `B`); two tall pages are shown side by side (`7–8 / 190`). The first page is always alone. Pages pair only when the window is at least as wide as it is tall.
- **Reading direction**: **LTR** or **RTL**, shown while **Spread** is on. RTL mirrors the edge taps, arrows and keys, not the swipe.
- HEIC photos from an iPhone are shown too.

## Markdown viewer

![Markdown viewer with frontmatter chips and a rendered Mermaid diagram](../images/user-guide/markdown-viewer-frontmatter-mermaid.png)

Notes show highlighted code blocks, Mermaid diagrams, task lists, and the frontmatter (`title`, `tags` and so on) as chips you can edit. Editing the tag chips changes the file. A `loft://<file id>` link opens that file, and the linked file shows up under **Related**.

With the [knowledge addon](../addons/knowledge.md) and its editor enabled for the drive, you can edit the note in the page with **Edit / Split / Preview**. Changes save as you type. Without it, notes are read-only apart from the chips.

## PDF viewer

- Select text as on any page. With the intelligence addon, Ask can quote the page you are on.
- **Zoom mode**: **Fit width** (the default), **Whole page** or **Actual size**, plus zoom buttons. Choosing a mode resets the zoom to 100%.
- **Page number**: type a page and press `Enter`. `PageUp` / `PageDown` and `←` / `→` turn pages.
- **Pages** tab: the table of contents and page thumbnails. Click one to go there.
- **Full screen**: the button beside **Open in new tab**, or `f`. It works like the [image viewer](#image-viewer), including **Spread** and zoom, but mouse clicks and drags select text instead of turning pages. A PDF that declares right-to-left reading opens that way. With the knowledge addon, the quote button is in the full-screen bar.
- Links inside the PDF to its own pages work.

## EPUB reader

- A book reflows to fit the page. A vertical Japanese book reads top to bottom, right to left.
- `←` / `→` turn pages in the book's reading direction; `PageUp` / `PageDown` or `Space` turn to the next or previous page, and a swipe turns them on a touch screen.
- **Full screen**: the button at the top right of the book, or `f`. The arrows, swipes and taps on the left or right edge turn pages in the book's reading direction. The same button, `f` or `Esc` closes it.
- Your place is kept, per profile, and the book reopens there. A book you left on its last page reopens at the start.
- Fixed-layout books (pages laid out as pictures, common for technical and illustrated books) cannot be shown yet; the page offers **Download** instead.
- Links to web pages open in a new tab. Scripts inside a book never run.

## Office files (DOCX / XLSX / PPTX)

There is no viewer for Office files. The page offers **Download** and **Open in new tab**, and shows the first lines of the document's text so you can tell similar files apart. Files over 20 MB and the old `.doc` / `.xls` / `.ppt` formats show no text. The text also makes the file findable in search.

## ZIP archives

An archive opens as a listing of its contents, without extracting it on the server. It has its own grid and list views, sorting, a type filter, and a path for folders inside it.

- Click an image to open it in a page-turner that works like the [image viewer](#image-viewer), with a **Download** button. Click a text file to read it under the listing.
- An entry that cannot be shown says **No preview** and offers **Download** instead.
- Source files such as `main.rs`, `Cargo.toml` or `Makefile` open as text; unknown files like `app.bin` do not.
- The **Pages** tab lists every entry at every depth, with a filter by path, so you can find a file without opening folders.
- Entries over 50 MB cannot be opened, and only the first 10,000 entries are listed.

## Text files

Text and source files are shown read-only, with line numbers. Copying the text leaves the numbers out. Source code is coloured when the file's extension names its language. Arriving from a search highlights the term you searched for.

A file over 1 MB asks before it loads. A very large file is shown without numbers or colour.

Only Markdown notes can be edited in the app (see above).

## Imported videos (media_import addon)

A `.loft` file from the [media_import addon](../addons/media-import.md) plays the original:

- **YouTube**: in Litloft's own player, with the channel and caption details below it. The **Player** setting switches between **Litloft** and **YouTube** controls. During an ad, Litloft's controls step aside. If the owner does not allow embedding, you get **Watch on YouTube** instead.
- **Vimeo**: in Vimeo's player.
- **Other sites**: a link to the original.

## Watch progress

Your position is saved every few seconds, and a video resumes where you left off unless you were within a few seconds of the start or end. Reaching the end keeps the record, so the file drops out of **Continue watching**. Live streams are not resumed. See [comments and watch history](comments-history.md).

## The `⋮` menu

Every file page has a `⋮` menu with **Edit** (title and description), **Download**, **Add to collection**, **Copy**, **Cut**, **Rename**, **Move** and **Move to Trash**. Addons add entries below a line; the intelligence addon adds **Index details**, which shows what has been indexed for the file and lets you **Regenerate** it.

To restore a file, use [Trash](trash-and-missing.md).

## Missing files

A file that is no longer on disk cannot be opened, but Litloft keeps its tags, comments and history. Everything comes back when the file does. See [trash and missing files](trash-and-missing.md).
