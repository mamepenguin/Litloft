# Correct behavior: excerpt on a source file's card

No spec covered this. It is the unspecified-behavior entry for a bug fix
(`docs/process/spec-and-design.md`). In tests, cite it as
`UNSPEC fix-source-card-excerpt`.

## Behavior

The three file surfaces are `FileCard`, `FileListRow` and `JustifiedFileCell`. On each,
a file with no thumbnail draws the excerpt (`data-testid="text-thumbnail"`) as follows.

| `file_type` | `mime_type` | Excerpt |
|---|---|---|
| `other` | `text/*`, e.g. `text/plain` (`.c`, `.h`, `.pl`, `.bat`), `text/x-python`, `text/css`, `text/javascript` | yes |
| `document` | `text/*` | yes, as before |
| `document` | an Office type the backend can extract | yes, as before |
| `document` | an Office type the backend cannot extract, `application/pdf` | no, as before |
| `other` | not `text/*`, e.g. `application/json`, `application/octet-stream` | no |
| `other` | an Office type the backend can extract | no |
| `subtitle` | any, e.g. `text/vtt` | no |
| `audio`, `archive` | any, including `text/*` | no |

A file that has a thumbnail (`has_thumbnail: true`, or `file_type` `video` or `image`)
draws the thumbnail and never the excerpt, on all three surfaces.

The file's filename does not affect the result, and neither does a missing `mime_type`
(no excerpt).

## What the excerpt says

The excerpt is the start of the file (the first kilobyte, as today), and what is done to it
depends on `file_type`:

- `other` + `text/*` (source code and other plain text that is not a document): the
  characters as they are in the file, with only leading and trailing blank space trimmed.
  Nothing inside is removed or rewritten: `#include <stdio.h>`, `i < n; i++`, `p->x`,
  `/* Reset */`, `*args, **kw`, `fns[i](x)`, `<a>b</a>` and a `---` first line all appear
  exactly as written.
- `document` + `text/*` (`.md`, `.markdown`, `.txt`, `.html`, `.csv`, `.rst`, ...): unchanged
  from today, the existing markup cleanup (frontmatter, headings, tags, links, emphasis).
- `document` + extractable Office: unchanged from today, the backend's extracted text.

Out of scope: a source file that is not UTF-8 (e.g. Shift_JIS) shows replacement characters,
the same as a `.txt` in that encoding does today.

## User-visible result

On a folder listing, `hello.py` shows its first lines on its card in place of the blank
card, in the card grid, in the list and in the justified grid.
