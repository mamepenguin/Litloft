# Decisions

decision: ship (Yuichi Senga, 2026-11-18, on r1 HUMAN_REVIEW_REQUIRED: "ship")
ran_in_app: yes
at: 429966bbb
by: author
evidence: Isolated stack from this worktree (r5_stack clone, port 3111), Playwright chromium, direct loads of /files/{id} for a note (Paa9RQdw77Ya), a PDF (M4MrgOcsrnOv) and a video (dFsYAAlqgj6G). With 429966bbb: no page error at 390, 700 and 1440 wide. Control on the same stack with the commit reverted and the frontend rebuilt: Minified React error #418 on the note and the PDF at 700 wide, none at 1440. The main stack on :3000 (older develop build) shows the same #418 at 700 wide on all three files.
pending: none

## After r1

R1-SCOPE-2 (consumers see desktop values in the first hydrated commit) measured: the stack rebuilt at 737b457b7 against the main stack's older develop build on :3000, Playwright chromium, direct loads of a note (Paa9RQdw77Ya) and a video (dFsYAAlqgj6G) at 390x844 and 700x844, 1.5s after network idle. Header, main and document scroll width identical, the mobile file sheet in the same place, and the screenshots side by side show the same page; the only box difference is the closed overlay sidebar at x=-240, which the older build does not mark with data-app-sidebar. No wrong layout was left behind by the first commit.
