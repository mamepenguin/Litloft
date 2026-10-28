# Decisions

decision:
ran_in_app: yes
at: de7af3f3424de32a1b10a03705cbe95d7f55b00a
by: agent
evidence: Local stack (`docker compose up -d --build`, http://localhost:3000, no other Litloft stack running), web UI driven with headless Chromium (Playwright from frontend/node_modules; the Chrome extension was not connected), MCP driven by running the freshly built mcp-server/dist/index.js over stdio against localhost (the user's configured litloft MCP points at production and was not used). History checked in the version history panel and via GET /api/files/{id}/versions[/{vid}]. Test files under 動画/r5 (plus one Quick note that landed in 動画/Inbox), all trashed afterwards. Screenshots in /private/tmp/claude-502/-Users-libre-Sources-video-share/3d2ddc76-2dbc-4c9c-b76b-6c2580633ca6/scratchpad/r5/.
  1. Scanned .md (no history), first edit in the web editor without a profile: history = [auto (new text), explicit "Kept version" with no nickname, body byte-identical to the file placed on disk]. Screens 01, 02-*.
  2. Same file, second edit with profile r5-tester (65 s later): one new auto row by r5-tester; still exactly one viewer-less explicit row. Screens 03-*.
  3. Restore of the baseline from the panel ("Restore this version"): file on disk back to the original text; restore recorded as explicit by r5-tester; baseline row unchanged. Screens 04-*.
  4. File uploaded through the web UI (upload/init, chunk, complete), then first edit with a profile: [auto r5-tester, explicit no-nickname baseline = uploaded text]. Screens 05, 06-*.
  5. MCP edit_file_content on a scanned .md: [auto r5-mcp, explicit no-nickname baseline = original text]. Second edit_file_content: the auto row was updated in place (same viewer), no second baseline.
  6. MCP update_file_content on a scanned .txt: [auto r5-mcp, explicit no-nickname baseline = original text].
  7. Failure case, pre-write equals new body (MCP update_file_content with identical text): one row, explicit with no nickname.
  8. Failure case, pre-write not UTF-8 (Latin-1 byte 0xE9), MCP update_file_content: no baseline; only the new auto r5-mcp row; write durable on disk; no "Could not record file version" or traceback in backend logs.
  9. Markdown tag write from the "Add tag" UI on a scanned .md with frontmatter: [auto r5-tester, explicit no-nickname baseline]. The baseline body contains an `id:` frontmatter line that the file placed on disk did not have: the scanner inserts the id and rewrites the file at scan time (scanner.py, outside write_text_content), so the baseline is the post-scan text, not the bytes the user placed. Screen 10.
  10. New note created in the web UI (Quick note, POST /api/drives/{drive}/files 201), then edited: [auto r5-tester, explicit no-nickname creation version] - two rows, no extra baseline. Screen 09-*. (Ctrl+N on the folder page did not create a file in headless Chromium; the folder "More actions" menu has no New note item.)
pending: none
