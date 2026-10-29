import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LitloftClient } from "./client.js";
import { allTools } from "./tools/index.js";

const SERVER_INSTRUCTIONS = `
Litloft is a personal home-LAN media and file library (videos, images,
documents, markdown notes). This server exposes the same operations the
Litloft web UI has, nothing more.

Key concepts:
- A "drive" is a top-level library (e.g. a mounted folder) and is a hard
  security boundary: there is no cross-drive search or listing. Most tools
  take a \`drive\` argument; call list_drives first if you don't already
  know the drive name.
- A "file_id" is a 12-character id (from search_files or get_file results),
  not a filesystem path.
- To browse a drive like a file tree, alternate list_folders (subfolders;
  one level at a time by default, or pass depth to recurse several levels
  in one call) and search_files with the same path and no search term
  (files directly in that folder).
- Deleting a file only ever moves it to trash (trash_file), recoverable for
  30 days via restore_file. There is no permanent-delete tool.
- To change part of a Markdown/plain-text file, use edit_file_content
  (exact old_string → new_string; it reads the file itself). To replace a
  whole file, read it in full with get_file_content and pass its ETag to
  update_file_content (content is plain text, not base64); a 412 means it
  changed since you read it. A ranged read (offset/limit) returns no ETag,
  so it can never be written back whole.
- get_file_content reads any text/* or JSON file; read files over 1 MB in
  line ranges. To open a file by its path, use get_file_by_path.
- To read a PDF, Word, Excel, PowerPoint or EPUB file, use read_document
  (page, slide, sheet or section at a time; follow its \`next\` cursor).
- Folders: create_folder, rename_folder, move_folder, trash_folder. Many
  files at once: move_files, copy_files, trash_files, restore_files,
  add_tags (up to 100 ids each). trash_folder and trash_files only move
  files to trash.
- search_files only matches filenames/folder paths. semantic_search is a
  hybrid search: it also matches filenames/paths/tags, plus ranks by
  transcript/caption/embedding relevance and returns the matching excerpt —
  prefer it for "find files about X" style queries.
- To find every place a string appears (like grep), use search_exact; to
  find files about a topic, semantic_search; to find where something is
  shown in a video, search_video_scenes (videos with a Visual Index only).
- ask can synthesize an answer through Litloft's intelligence addon. It
  streams internally and returns the final answer plus source events.
- upload_file is for small notes/documents/images only (10MB cap on
  decoded content) — not for large video files. Pass plain text via
  content, or base64 via content_base64 for binary files.
- To embed an uploaded image inside a markdown/text file's content, reference
  it as \`![alt](loft://file_id)\` (the file_id from upload_file's completion
  response). A plain relative path or filename will NOT render — only the
  \`loft://file_id\` scheme resolves to the file's stream URL.
- To see what a video shows rather than what is said in it, call
  list_video_scenes for an overview (scene times, nearby transcript and a
  small frame each), then get_video_frame for a large frame at a time of
  interest — from the scene list, get_transcript, or a semantic_search time
  range. Large frames are big enough to read on-screen text.
- add_comment and web clipper tools need LITLOFT_VIEWER so Litloft can
  attribute the write to a profile.
`.trim();

export function createLitloftServer(client: LitloftClient): McpServer {
  const server = new McpServer(
    { name: "litloft", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      (args) => tool.handler(args, client)
    );
  }

  return server;
}
