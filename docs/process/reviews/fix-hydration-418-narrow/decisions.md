# Decisions

decision:
ran_in_app: yes
at: 429966bbb
by: author
evidence: Isolated stack from this worktree (r5_stack clone, port 3111), Playwright chromium, direct loads of /files/{id} for a note (Paa9RQdw77Ya), a PDF (M4MrgOcsrnOv) and a video (dFsYAAlqgj6G). With 429966bbb: no page error at 390, 700 and 1440 wide. Control on the same stack with the commit reverted and the frontend rebuilt: Minified React error #418 on the note and the PDF at 700 wide, none at 1440. The main stack on :3000 (older develop build) shows the same #418 at 700 wide on all three files.
pending: none
