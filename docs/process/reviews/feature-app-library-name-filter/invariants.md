spec: docs/specs/app-library-name-filter.md

## Revisions

I10. (acceptance) No request carries a `search` longer than 200 characters or with outer whitespace; the name is normalised by trimming, cutting to 200 UTF-16 code units, and trimming again, and a See all or Clips URL whose `q` is not in normalised form is replaced, without a history entry, by its normalised form.
I6. (acceptance) In Clips the name is exactly the normalised URL `q` on the Library and Library-origin shelf pages; a name change and a Target choice add no history entry; a Target choice, a Home-shortcut landing on a Target other than the one in force, the tab links, the unknown-view rewrite and the leave-for-Home replace remove `q`; the 分類 / 並び順 choice, the group/sort fill-in, the unreadable-trust rewrite, a shelf page's sort fill-in, the `target` removal after a landing on the Target in force and a Library-origin shelf page's back link keep it; the field is drawn whenever the current tab is ライブラリ.
