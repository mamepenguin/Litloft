# R-0 invariants — the notes' opening text, fetched once per listing

Approved by the user 2026-09-20.

1. The endpoint never returns text for a file the caller cannot read: the ids are filtered through core's access control before anything is read.
2. A note row's height does not change after it appears — the opening text, where the note has body text, is in the first frame that shows the row.
3. A note without body text shows no excerpt line, as before.
4. One request per listing, not one per row; a page appended to a listing asks only about its own ids.
5. If that request fails, the rows still appear (without their opening lines) and never grow afterwards.
6. The excerpt text is what it was: frontmatter stripped, and a first line that only repeats the title dropped.
7. Nothing else about the rows changes — order, links, query marks, tags, folder, time.

## Measured before and after (mobile, 150 ms latency, 4x CPU)

Notes landing, rows/excerpts over time and requests:

| | before | after |
|---|---|---|
| rows appear | `8/0` → `8/3` → `8/4` (rows grow twice) | `8/4` (complete at once) |
| requests | 9 file streams, one per row | 1 `/note-openings` |

The page's CLS is unchanged (0.206 → 0.204): its one shift is the recent-notes
block appearing and pushing the section below it, which this change does not
address and was not meant to.

## Revisions

After r1 (author, prompted by r1 F1/F2/F6/F7; the user chose the drive filter
in F6 and approved the fixes for the rest):

8. The endpoint reads only each file's opening — the range is asked for and
   the answer is cut again — so a list of ids cannot become hundreds of whole
   files in memory.
9. A row that has been drawn stays drawn: a further page never removes the
   rows already on screen.
10. The ids are held to the drive whose listing asked, not merely to what the
    caller could read elsewhere.
11. One file that cannot be read costs the listing only its own opening.
