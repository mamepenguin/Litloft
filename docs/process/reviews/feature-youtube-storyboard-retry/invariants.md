spec: docs/specs/youtube-storyboard-retry.md

## Revisions
I1. (r1) After a storyboard failure of a YouTube `.loft`, a reindex request naming `clip` that the route answers `accepted` (200) or `already_queued` (202) makes the next storyboard leg of that file call the YouTube lookup.
