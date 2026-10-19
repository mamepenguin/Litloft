# P1 R-0 invariants — Notes landing redesign (knowledge 3e81b79)

1. The landing requests recent notes once as `type=text, sort=updated_at, order=desc, limit=8`, lists exactly those files in that order, and each opens its canonical file URL.
2. Continue writing requests at most 3 text-history items, only when a profile is set, and renders nothing when there is none.
3. Every recent note appears under exactly one age heading (today / past 7 days / past 30 days / earlier by calendar day), keeping the order returned.
4. A bookmarklet landing with `autosubmit=1` sends exactly one clip, including after navigating to `q=` or `view=all` and back.
5. A clip still being sent when the reader navigates to a results page is still recorded in recent clips when they return.
6. On `q=` and `view=all` the clip section and both entries are hidden and unreachable; the search field stays and keeps the query.
7. Searching pushes the trimmed query as `q=`; a blank `q` shows the landing.
8. At rest the landing has exactly one accent fill, New note, and none when the editor policy is off.
9. A failure in Continue writing, Recent notes, a results page, or an excerpt fetch leaves the other parts rendered and adds no second alert.
