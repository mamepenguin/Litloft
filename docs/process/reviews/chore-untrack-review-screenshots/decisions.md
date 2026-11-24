# Decisions

decision:
ran_in_app: not-applicable
at: 4fa9fda0bb52e68c701f61a1f10e3a37358d25e8
by: agent
evidence: The change touches only .gitignore, .claude/agents/design-checker.md, docs/process/PROJECT.md and removes 4859 review screenshots under docs/process/reviews/ from the index; `git diff --name-only develop...HEAD` lists nothing under backend/, frontend/ or addons/, so no Litloft user-observable behaviour changes and there is no app path to run. Ignore behaviour checked with `git check-ignore -v --no-index`: shots/r5b-4-after-resume.png (feature-transcript-touch-actions) ignored by .gitignore:74; nested r5/addon-012-014/02-refine-routing-claude.png ignored by .gitignore:74; a hypothetical .mp4 ignored by .gitignore:79; design/AOff.dc.html and a design/x.png re-included by .gitignore:81 (`!/docs/process/reviews/*/design/**`); decisions.md not ignored. Tracked design PNGs (e.g. feature-scenes-change-points/design/preview-all.png) remain in the index, none of the 4859 deletions is under design/, and no non-design image remains tracked under docs/process/reviews/. A removed screenshot is still present on disk.
pending: none
