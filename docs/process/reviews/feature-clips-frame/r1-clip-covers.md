# r1: clip-covers route (knowledge f0cae25 tests, 3414748 route)

Reviewed: `addons/knowledge` at 3414748 (`git show f0cae25`, `git show 3414748`), against
SPEC-ADDON-140 items 13-15, 2, 6, 8, 10 and I6, I7. Threat model: personal tool, owner only.
Baseline: `tests/test_clip_covers.py` 25 passed.

## Findings

### Bucket A (silently wrong in normal use)

**A1. A URL or image cut at the 4096-byte boundary becomes the site as a fragment.**
`app/routers/clip_covers.py:74-77` with `:112` (the opening is cut at `OPENING_BYTES`).
Rule: I7 ("it is never text that is not such a host"), item 14 `site`.
Condition: a clip with no frontmatter `url` (the spec's production recipes) whose first
image or first non-image URL straddles byte 4096 with nothing earlier. Measured in the test
image: `"a"*4085 + " https://www.example.com/x"` cut to 4096 gives `site="ww"`;
`"a"*4080 + "\n![x](https://cdn.example/p.jpg)"` cut gives `site="cd"` (also an image's
target, the second half of I7). Fix shape: when the read came back full, ignore a URL
match that touches the end of the text.
Frequency 1, impact 3.

**A2. An image URL containing `)` is cut at the first `)`.**
`app/routers/clip_covers.py:31` (`_IMAGE`: `[^\s)>]*`). Rule: item 14 ("`image_url` is
that URL"). Condition: markdownify emits `![](https://host/a_(1).jpg)` unescaped
(wiki-style file names). Measured: `image_url="https://cdn.example/a_(1"`; the browser
fails the load and the card keeps the tint.
Frequency 1, impact 2.

**A3. An image whose alt text contains `]` is not seen as an image; its URL becomes the site.**
`app/routers/clip_covers.py:31` (`\[[^\]]*\]`). Rule: I7 (cover is the first Markdown
image; site is never an image's target). Condition: `![a [b] c](https://cdn.example/p.jpg)`
(markdownify copies alt verbatim). Measured: cover `None`, `site="cdn.example"`; a later
image, if any, becomes the cover instead.
Frequency 1, impact 3.

**A4. (Spec reading for the human) A linked image `[![](img)](img)` gives the image host as the site.**
`app/routers/clip_covers.py:74`. `_IMAGE.sub` removes the inner image and leaves
`[ ](img)`, whose link target is the same image URL. Item 14 lists a link target as a
site candidate, so the code follows the letter; I7's "not an image's target" is broken by
value. `app/services/extractors/generic.py:107` runs markdownify, which emits this shape
(`sites/cookien.py:231-236` unwraps it for Cookien only). Only reached when the frontmatter
has no `url` (the clipper always writes one, `app/main.py:76`). Measured:
`site="cdn.example"` with a real link `[r](https://blog.example/)` after it.
Frequency 1, impact 3. Decide whether a link whose target equals an image target is
excluded.

### Test gaps (mutation survivors)

**T1. Survivor: removing `.rstrip(_URL_TAIL)` (`clip_covers.py:76`) passes all 25 tests.**
The "bare url" row puts the `.` after a path (`https://bare.example/x.`), where it never
reaches the host. Missed defect: a sentence ending in a bare host URL
(`see https://bare.example.`) shows `bare.example.` as the site (I7). A row with
punctuation directly after the host would kill it. Missed-defect score: frequency 1,
impact 2.

**T2. Survivor: `get_file_opening(file_id, 10**9)` passes all 25 tests.**
The fake slices by whatever `max_bytes` it is given and no test asserts the argument.
Missed defect: whole-file reads per clip (item 10's 4096-byte bound), slow but not wrong.
Frequency 0 (needs a code change), impact 3.

Killed (each restored after): drive filter on the first bulk (1 failed), `TEXT_MIMES`
filter (1), `filter_file_ids` step (2), same-drive check on the loft bulk (1),
`file_type == "image"` check (1), active-file check on loft ids, by answering every loft id
as an active image (5), image-target exclusion from site (4), frontmatter-url-first (1),
HTML `<img>` exclusion from site (1), unchecked `image_id` (4), `www.` strip (2), 60-id
cap (1), http(s) scheme check (1). Active-file check on the first bulk is core-side
(`backend/app/routers/internal.py:617-620`, `active_file_filter()`); the test's fake drops
`gone` ids there and the I6 test kills a fake that does not.

### Bucket B (odd input / misuse)

**B1. Item 8's debug log on a failed opening read is absent.**
`app/routers/clip_covers.py:113-115` returns `None` without logging. Spec item 8. Frequency
0, impact 1.

**B2. Markdown image forms the clipper does not emit are not covers, and their URL becomes the site.**
Reference-style `![x][1]` with `[1]: url`, an angle target with a space
`![x](<https://h/a b.jpg>)`, a single-quoted title `![x](url 't')`. Measured: each gives
`site="cdn.example"`. markdownify emits none of these. Frequency 0, impact 2.

## Author interpretations

- HTML `<img src>` URLs excluded from site candidates: consistent with I7 ("not an image's
  target"); item 14's list (link target, autolink, bare URL) does not contradict it. Agree.
- A frontmatter cut by the 4096-byte limit treated as no frontmatter: the clipper writes
  three short keys (`app/main.py:75-79`), so the cut needs a hand-written frontmatter over
  4 KB; the result then scans the frontmatter text as body, whose first URL is usually the
  `url:` value anyway. Agree; no finding.

TOTAL: 8 findings
