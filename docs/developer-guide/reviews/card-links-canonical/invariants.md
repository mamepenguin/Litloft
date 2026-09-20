# R-0 invariants — card links to the canonical file URL

Approved by the user 2026-09-20.

1. Pressing a file card or row in a drive listing never leaves `/drive/{drive}`: the sidebar and the tree are not rebuilt.
2. A card's or row's link is the URL the `/files/{id}` redirect lands on for the same file and query: drive, folder path, `file`, and only the keys the redirect carries (`t`, `page`, `highlight`, `sort`, `order`, `edit`, `nav`).
3. A file listed outside its own folder (favourites, all files, search and other cross-folder views) links to its own folder.
4. Cmd/Ctrl-click, selection mode and the tree's navigation override (`fileNavigationOverride`) behave as before.
5. Opening the link in a new tab shows the same page.
