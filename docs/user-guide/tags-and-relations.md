# Tags and file relations

Tags belong to one drive. There are no tag folders or nested tags. Relations link one file to another, and appear on a file's **Related** tab.

![File detail page showing frontmatter tag chips and related files](../images/user-guide/tags-related-files.png)

## Tags

On a file's page, add or remove tags in the **Tags** section. As you type, it suggests tags already used anywhere in the drive.

What a tag may be:

- Up to 10 tags per file, and up to 30 characters per tag.
- Letters, digits, `_` and `-` only. No spaces. Letters in any language work, so Japanese tags are fine.
- Tags that differ only in case count as one. The first spelling is kept.

To tag several files at once, select them and choose **Tag** in the selection bar. See [selecting several files](file-browsing.md#selecting-several-files).

### Tags on Markdown files

On a Markdown file, the tags are the `tags:` list in the file's frontmatter. Editing tags in Litloft rewrites that list. With the [Knowledge addon](../addons/knowledge.md), tags you add in another editor, such as Obsidian, appear in Litloft too. On every other kind of file, Litloft keeps the tags itself and the file is not changed.

### Tag filtering and scope

Click a tag in the **Tags** section of the sidebar to filter the listing by it. Click it again to go back.

- The list shows only tags used in the folder you are in and its subfolders, with a count for that folder. The heading then reads **Tags — under** followed by the folder name.
- The filter shows matching files in the folder and all its subfolders, not only the files directly inside it. At the drive root it covers the whole drive.
- **Search the whole drive**, in the toolbar and on an empty result, widens the filter to the entire drive.
- You can filter by one tag at a time. Case does not matter.
- The section shows the most used tags first. **All tags (N)** opens the rest. The sort button beside the heading switches between by count and by name.

### Suggested tags (intelligence addon)

With the [intelligence addon](../addons/intelligence.md#auto-tags), a file's page can show **AI tag candidates**. Nothing is added until you choose:

- Press the check on a tag to add it, or **Add all**.
- **Close** discards the candidates. **Create again** asks for a new set.

An administrator may need to turn the feature on, and it may only run when you press **Create AI tag candidates**.

## File relations

A relation links two files in the same drive. Litloft creates them from the links in your Markdown notes. Addons can add their own.

### Links in Markdown notes

When you save a Markdown note, Litloft reads its links and relates the note to each file they point to:

- `loft://<file_id>` links to a file.
- `[[wiki links]]` to other Markdown files in the drive.
- `source_file_ids` in the frontmatter.

Remove a link from the note and the relation goes away on the next save.

Renaming a Markdown file updates `[[links]]` to it in the other notes of the drive.

### The Related tab

A file's inspector has a **Related** tab after **Info**. It appears when the file has relations, or when an addon adds something to it. It has up to three lists:

- **Links from this file**: files this note links to.
- **Links to this file**: notes that link to this file.
- **Related files**: relations made some other way, such as by an addon.

Click a row to open that file. Files in the trash are left out. Missing files stay in the list, greyed out.

Addons add more below the lists: **Similar files** from the intelligence addon, and on notes and text files **See connections as a graph** from the Knowledge addon.

While a collection is playing, the same lists appear under **Related** below the player.

For scripts, see the [HTTP API reference](../reference/api.md).
