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
| `audio`, `archive` | any, including `text/*` | no |

A file that has a thumbnail (`has_thumbnail: true`, or `file_type` `video` or `image`)
draws the thumbnail and never the excerpt, on all three surfaces.

The file's filename does not affect the result, and neither does a missing `mime_type`
(no excerpt).

## User-visible result

On a folder listing, `hello.py` shows its first lines on its card in place of the blank
card, in the card grid, in the list and in the justified grid.
