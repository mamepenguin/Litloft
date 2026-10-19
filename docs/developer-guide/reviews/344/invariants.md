# PR #344 — invariants

The list each reviewer was briefed with.

1. A quote that fits in a single text node is wrapped in **exactly one**
   `<mark class="ask-citation-highlight">`.
2. A quote that crosses element boundaries gets a `<mark>` on **each**
   intersected text node; it does not fall through to the scroll-only path.
3. The concatenated text of the marks equals the matched extent — no more, no
   less. Text outside the match is not wrapped, and no character of the
   document is lost or duplicated.
4. A quote that does not match anywhere produces zero marks and scrolls the
   container to the top, as before.
5. Scrolling happens at most once per (containerRef, quote).
6. The effect re-applies after React resets `innerHTML`, and the already-marked
   guard still prevents double-marking on an ordinary re-render.
7. `ready=false` and an empty/whitespace quote still do nothing.

## Revision 1 — raised after round 1, approved after round 2

8. One passage is drawn as one shape however many elements it is split across.
   Inside a monospace block, whether a run is marked does not move the
   characters after it.

Round 1's finding 5 was a defect the change introduced and a user can see — a
citation crossing a token became a chain of rounded pills, and inside a `pre`
the padding pushed every character after each seam. It broke none of 1–7,
because the list was written about what the marks *contain* and said nothing
about what they *look like*. Round 2 was briefed with 8 marked as proposed and
unapproved, and tested it as a claim rather than as settled.
