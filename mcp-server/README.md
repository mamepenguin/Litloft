# Litloft MCP Server

An MCP (Model Context Protocol) server that lets an MCP client (e.g. Claude
Desktop) browse and edit a [Litloft](../README.md) library through natural
language.

It is a thin wrapper around Litloft's existing public REST API
(`/api/*`) — the same API the web frontend uses. It adds no new backend
endpoints and no bypass of existing validation or drive access control; the
backend remains the single source of truth for what is and isn't allowed.

## How it works

```
MCP client (Claude Desktop, etc.)
  │ stdio (MCP protocol)
  ▼
litloft-mcp-server (this package)
  │ HTTP, Authorization: Bearer <token>
  ▼
Litloft frontend :3000  →  backend :8000 (Docker-internal)
```

The server authenticates with a JWT obtained the same way the web UI does
(`POST /api/auth/unlock`), sent as a `Bearer` token instead of a cookie.
Drive access control, file lifecycle rules, and all other backend
invariants apply exactly as they do for the web UI — this server has no
elevated privileges.

## Requirements

- Node.js 20+
- A running Litloft instance reachable over HTTP (LAN or a VPN/tunnel into
  your LAN — this server does not add internet-facing hardening)

## Setup

```bash
cd mcp-server
pnpm install
pnpm run build
```

### Get a token

Litloft has no separate "API token" concept — it reuses the same
group-password login as the web UI. Unlock with `remember: true` to get a
long-lived (365-day) token:

```bash
curl -X POST http://<litloft-host>:3000/api/auth/unlock \
  -H "Content-Type: application/json" \
  -d '{"password": "<your drive password>", "remember": true}'
```

The response body includes a `token` field. If no password is configured
(`passwords.json` absent or empty), every drive is public and any token
value works, but you still need `LITLOFT_API_TOKEN` set to a non-empty
string.

### Configure your MCP client

Example for Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "litloft": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "LITLOFT_BASE_URL": "http://<litloft-host>:3000",
        "LITLOFT_API_TOKEN": "<token from the unlock response>"
      }
    }
  }
}
```

Restart the client after editing its config.

## How the agent discovers what it can do

The agent never reads this README — it only sees what the MCP protocol
exposes:

- **`instructions`** (`src/index.ts`): a short server-level brief sent in
  the `initialize` response, describing the drive/file_id concepts, the
  trash-not-purge behavior, and the ETag-based content-edit workflow.
- **Per-tool `description` and `inputSchema`** (`src/tools/read.ts`,
  `src/tools/write.ts`): sent via `tools/list`. This is the only
  documentation an MCP client's model has for each individual tool, so
  tool descriptions carry the actual usage rules (e.g.
  `update_file_content`'s description explains the 412-conflict retry
  flow) rather than assuming the agent has read anything else.

When adding a new tool, put agent-facing behavior notes in its
`description`, not just in this file.

## Available tools

### Read

| Tool | Description |
|---|---|
| `list_drives` | List drives visible to the current credentials |
| `list_folders` | List the immediate subfolders under a path (one level deep) |
| `search_files` | Search/list files within a single drive (set `path` with no `search` to list a folder's files) |
| `get_file` | Get metadata for a single file |
| `get_file_content` | Read the text content of a small `text/markdown`/`text/plain` file (≤1MB), plus its ETag |
| `semantic_search` | Rank files in a drive by relevance to a natural-language query, using transcripts/captions/embeddings (not filename matching); returns matching excerpts |
| `get_transcript` | Get a video/audio file's Whisper transcript as time-stamped chunks, optionally narrowed to a time range |
| `get_watch_history` | Continue-watching / watch history for a drive |
| `list_comments` | List comments on a file |

### Write

| Tool | Description |
|---|---|
| `rename_file` | Rename a file |
| `move_file` | Move a file to a different folder/drive |
| `trash_file` | Soft-delete a file (recoverable for 30 days) |
| `restore_file` | Restore a file out of trash |
| `update_tags` | Replace a file's full tag list |
| `update_file_content` | Overwrite a text/markdown file's content (requires the ETag from `get_file_content`) |
| `create_playlist` | Create a playlist (collection) in a drive |
| `add_to_playlist` | Add files to an existing playlist |
| `upload_file` | Upload a new small file (note, document, image) via base64 content, ≤10MB decoded |

Every write tool call maps 1:1 onto an existing Litloft API endpoint, with
no additional gating beyond what the backend already enforces. The MCP
client's own tool-call confirmation step is the trust boundary — Litloft
does not double-gate on top of it.

## Known limitations

A few tools that were originally planned are not implemented yet, because
they depend on backend/addon changes outside this package's scope:

- **`ask` (intelligence Q&A / RAG)**: unlike `semantic_search`, the `/ask`
  endpoint reads its auth cookie directly (for a second, redundant
  drive-access check before forwarding content to the LLM) rather than
  going through the addon proxy's Bearer-aware drive gate, so
  addon-proxied requests from this server aren't recognized as
  authenticated yet. In practice this isn't a hard blocker: an agent can
  combine `semantic_search` (ranked results + matching segment/time range)
  with `get_transcript` (narrowed to that time range) to read the relevant
  source material itself and answer directly, without a dedicated `ask`
  tool.
- **`add_comment`**: posting a comment requires a `lit_viewer` profile
  cookie, which this server doesn't carry.
- **Purge (permanent delete)**: intentionally excluded — only the
  soft-delete/restore (trash) flow is exposed.

## Development

```bash
pnpm test        # run tests once
pnpm test:watch  # watch mode
pnpm run dev      # run the server directly with tsx (no build step)
pnpm run build    # compile to dist/
```

`src/client.ts` is the only layer that talks HTTP; `src/tools/*.ts` map MCP
tool calls onto it 1:1 and contain no business logic of their own — that
stays in the backend. Tool tests use a fake `LitloftClient` (see
`src/__tests__/testClient.ts`) so they assert the tool→endpoint mapping
without re-testing HTTP behavior already covered by `client.test.ts`.
