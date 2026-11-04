spec: docs/specs/ingest-progress.md

## Revisions

I6. (r1) Every write that moves one of the three flags from false to true posts, resume included; a write that changes more than 100 files posts several events of at most 100 ids each. Section 10's "none from resume" and "one per metadata batch" are superseded.
I8. (r2) An entry fetches once as soon as it enters the processing view, then on events naming its id and on the tick, and never after it is ready, gone, removed, or 30 minutes past Complete.
I14. (r3) Every intelligence post to the core's addon-events endpoint goes through `app/addon_events.py`, carries the internal secret and names the drive of the file it concerns; a post without a drive is not sent. The refine, detailed-summary and vision events, which production dropped with 403 before, are now delivered, to viewers of that drive only. Touch points add `addon_events.py` and the refine, summaries, vision, chapter_suggestions and video_visual workers.
