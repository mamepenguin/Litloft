# Spec review r2 — docs/specs/collection-play-two-pane.md (SPEC-CORE-190..193)

Reviewer: spec-design-reviewer (fresh agent), against commit 3cc62db5e. Returned as a message;
saved by the author. r1 items: all resolved or carried into the findings below.

1. SPEC-CORE-082 I7 / I8 / I9 contradicted by the tree-off visit pane; `leftPaneContext.ts`
   (`shownBySetting`) gates the yield. Author. → revised 082 I7–I9, touch point added.
2. Tree-off visit transitions (after the queue ends, re-show, phone, yield). Human. → owner
   2026-11-28: the pane goes away with the queue; the button re-shows without writing; it
   yields; it does not open by itself on a phone.
3. Previous / next missing on the document row (`MarkdownDocumentLayout`). Author. → added.
4. ← / → on non-player files walk the folder while the buttons walk the queue. Human. →
   owner: they walk the queue.
5. Media Session next track already calls `onEnded`. Human. → owner: next follows the
   advance rule and plays; previous track added; device check in agent_cannot_verify.
6. `.loft` items cannot autoplay. Author. → playable; exempt from the autoplay clause of I11;
   advances only when the embed reports an end.
7. The Smart name link needs the Smart Folder's query. Author. → one `smart-folders` read;
   name and link rules while pending, failed, deleted.
8. Random folder sort starts mid-queue. Human. → owner: the order shown at the press,
   stored for the tab.
9. No invariant for the folder queue's contents and order, or for Play's first item. Author.
   → I15, I16.
10. "Made from this page" writes reach unlisted code. Author. → `collectionChanged.ts`,
    `CollectionPicker`, `SidebarCollectionsSection`, `FileActions`.
11. A failed re-read during playback. Author. → re-reading state; old queue kept; I14.
12. Further touch points (`projects.ts`, `spec-viewport.spec.ts`, `DocumentSideSlot.test.tsx`,
    `PlainTextDocument.test.tsx`, non-fill branches). Author. → added, with the keep/remove rule.
13. No measurement that the row still fits (SPEC-CORE-094 I8, 098 I8). Author. → added to §10.
14. "While a queue is shown" ambiguous. Author. → "queue page" defined as having a ready queue.
15. `queue=` lifetime edges (gallery close, same-file choice through search, sort/order).
    Author. → §1 Folder steps 5 and 7, I5.

TOTAL: 15 findings
