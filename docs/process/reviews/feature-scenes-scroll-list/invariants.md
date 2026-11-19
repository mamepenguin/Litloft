spec: docs/specs/scenes-scroll-list.md

## Revisions

I6. (acceptance) A tile's picture is requested only after its row has stayed within one row step of the visible area, boundary included (a row whose edge is exactly one row step from the visible area is requested), for 150 ms with no scroll in between, at most once while the panel stays shown and the file is the same, and a drawn picture is not removed while the panel stays shown.
I11. (acceptance) In bounded form a vertical swipe that starts on the ruler moves nothing and is not a reader's scroll: following stays as it was. In flow form, when neither the card nor the placeholder is drawn, the visible area ends at the scroller's bottom.
I2. (R-5) On show, a file change and the frames arriving, the first painted list has the playing row placed with a `mediaController`, or the list's top at the top of the visible area without one. After any other placement event, while following is set, the section is shown and a controller is present, the playing row is wholly visible; `scrollTop` changes only when it was not, and then it is the second row of the visible area, or the first for row 0 or when the visible area is shorter than two row steps, clamped to the scroll range. "Place a row" follows the same rule.
