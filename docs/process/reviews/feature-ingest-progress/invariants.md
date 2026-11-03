spec: docs/specs/ingest-progress.md

## Revisions

I6. (r1) Every write that moves one of the three flags from false to true posts, resume included; a write that changes more than 100 files posts several events of at most 100 ids each. Section 10's "none from resume" and "one per metadata batch" are superseded.
I8. (r2) An entry fetches once as soon as it enters the processing view, then on events naming its id and on the tick, and never after it is ready, gone, removed, or 30 minutes past Complete.
