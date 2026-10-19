# Invariants: summary long as bullets

## Touch points

- `addons/intelligence/app/prompts/summaries/short_long_system.jinja2`
- `addons/intelligence/app/workers/summaries.py` — short/long parse and save
- `addons/intelligence/frontend/SummarySection.tsx` — long rendering
- `file_summaries.long_summary` (written, schema unchanged)
- `docs/addons/intelligence.md`

## Invariants

1. A `long` array of N non-empty strings (1 ≤ N ≤ 5) is stored as exactly N
   lines, each `- ` followed by the stripped item, in order.
2. A `long` array with more than 5 items stores only the first 5.
3. A `long` string is stored exactly as today (stripped), not rejected.
4. A `long` that is empty, all-blank, or neither string nor array saves nothing
   (no row written), as today.
5. A `long_summary` whose every non-blank line starts with `- ` renders as a
   list with one item per line and no visible `- ` marker; any other value
   renders as the same paragraph as before.
6. Editing, reverting and hiding a summary behave as before, and the edited
   `long_summary` still reaches the metadata embedding text.
7. `short_summary` generation and storage are unchanged.
