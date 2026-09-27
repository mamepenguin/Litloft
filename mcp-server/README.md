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
        "LITLOFT_API_TOKEN": "<token from the unlock response>",
        "LITLOFT_VIEWER": "<nickname for comments and clips>"
      }
    }
  }
}
```

Restart the client after editing its config.

### Connect ChatGPT through Secure MCP Tunnel

[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
lets ChatGPT reach this stdio server without exposing Litloft or an MCP HTTP
endpoint to the public internet. The tunnel is transport only: the
`LITLOFT_API_TOKEN` still determines which drives and actions are available.

Run `tunnel-client` on the Litloft host and connect to Litloft over loopback when
possible. A different always-on host is suitable only when it reaches Litloft
through an encrypted trusted path such as HTTPS, mTLS, or a VPN; a plain HTTP
request over the LAN exposes the bearer token in transit. The integration is
unavailable whenever Litloft, `tunnel-client`, or that host is offline, so a
laptop that routinely sleeps is a poor location.

You need:

- ChatGPT developer mode and permission to use plugins in the target account or
  workspace;
- a tunnel associated with that ChatGPT workspace and its `tunnel_id`;
- a runtime API key allowed to use the tunnel; and
- the `tunnel-client` binary downloaded from Platform tunnel settings or the
  latest official release.

Build this package and obtain a Litloft token as described above. For a first
test, omit `remember: true` when unlocking so the token expires after 24 hours.
After the connection is proven, a remembered token lasts 365 days.

Export the MCP process environment on the host that runs the tunnel. Keep these
values in the host's service manager or secret store; do not commit them:

```bash
export CONTROL_PLANE_API_KEY="<OpenAI runtime API key>"
export LITLOFT_BASE_URL="http://127.0.0.1:3000"
export LITLOFT_API_TOKEN="<Litloft token>"
export LITLOFT_VIEWER="<nickname for comments and clips>"
```

If the tunnel runs on another host, set `LITLOFT_BASE_URL` to the HTTPS or
VPN-reachable Litloft address. Use Litloft's frontend port, not the
Docker-internal backend port.

Create and validate a named stdio profile:

```bash
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile litloft \
  --tunnel-id <tunnel_id> \
  --mcp-command "node /absolute/path/to/mcp-server/dist/index.js"

tunnel-client doctor --profile litloft --explain
tunnel-client run --profile litloft
```

Keep the final command running under the host's normal service manager. The
tunnel client also exposes loopback-only `/healthz`, `/readyz`, `/metrics`, and
`/ui` endpoints for local diagnosis.

In ChatGPT, enable developer mode under **Settings → Security and login**. Open
**Plugins**, create a developer-mode app, choose **Tunnel** as the connection,
and select the tunnel or enter its `tunnel_id`. Review the discovered Litloft
tools before installing the app. Once the app is available to the account, it
can be used from ChatGPT on the web, desktop, and mobile; creation and connection
management are best done on the web or desktop.

Use a Litloft password whose groups include only the drives ChatGPT should
access. Every person allowed to use this ChatGPT app shares the access carried
by that one token. Removing the password later does not revoke an already issued
JWT; use a short-lived token or rotate Litloft's JWT signing secret if immediate
revocation is required. Rotating the signing secret signs out every Litloft
session.

Secure MCP Tunnel is intended here for a private developer-mode connection. It
does not satisfy the stable public HTTPS endpoint requirement for publishing a
public plugin.

## How the agent discovers what it can do

The agent never reads this README — it only sees what the MCP protocol
exposes:

- **`instructions`** (`src/index.ts`): a short server-level brief sent in
  the `initialize` response, describing the drive/file_id concepts, the
  trash-not-purge behavior, and the ETag-based content-edit workflow.
- **Per-tool `description`, `inputSchema`, and safety annotations**
  (`src/tools/read.ts`, `src/tools/write.ts`): sent via `tools/list`. This is
  the only documentation an MCP client's model has for each individual tool,
  so tool descriptions carry the actual usage rules (e.g.
  `update_file_content`'s description explains the 412-conflict retry
  flow) rather than assuming the agent has read anything else. The annotations
  distinguish read-only, additive, destructive, idempotent, and open-world
  operations so the client can apply suitable confirmation behavior.

When adding a new tool, put agent-facing behavior notes in its
`description`, not just in this file.

## Available tools

### Read

| Tool | Description |
|---|---|
| `list_drives` | List drives visible to the current credentials |
| `list_folders` | List subfolders under a path (one level deep by default; pass `depth` up to 5 to recurse and nest results under `subfolders`) |
| `search_files` | Search/list files within a single drive (set `path` with no `search` to list a folder's files) |
| `get_file` | Get metadata for a single file |
| `get_file_content` | Read the text content of a small `text/markdown`/`text/plain` file (≤1MB), plus its ETag |
| `semantic_search` | Rank files in a drive by relevance to a natural-language query; a hybrid search combining transcript/caption/embedding relevance with filename/title/path/tag matching — returns matching excerpts |
| `get_transcript` | Get a video/audio file's Whisper transcript as time-stamped chunks, optionally narrowed to a time range |
| `get_watch_history` | Continue-watching / watch history for a drive |
| `list_comments` | List comments on a file |
| `ask` | Ask Litloft Intelligence a question within one drive |

### Write

| Tool | Description |
|---|---|
| `rename_file` | Rename a file |
| `move_file` | Move a file to a different folder/drive |
| `trash_file` | Soft-delete a file (recoverable for 30 days) |
| `restore_file` | Restore a file out of trash |
| `update_tags` | Replace a file's full tag list |
| `update_file_content` | Overwrite a text/markdown file's content as plain text, not base64 (requires the ETag from `get_file_content`) |
| `create_playlist` | Create a playlist (collection) in a drive |
| `add_to_playlist` | Add files to an existing playlist |
| `upload_file` | Upload a new small file (note, document, image), ≤10MB decoded — plain text via `content`, or base64 via `content_base64` for binary files |
| `add_comment` | Post a comment on a file (requires `LITLOFT_VIEWER`) |
| `clip_url` | Create a Knowledge web clip from a URL (requires `LITLOFT_VIEWER`) |
| `clip_pasted` | Create a Knowledge clip from pasted HTML (requires `LITLOFT_VIEWER`) |

Every write tool call maps 1:1 onto an existing Litloft API endpoint, with
no additional gating beyond what the backend already enforces. The MCP
client's own tool-call confirmation step is the trust boundary — Litloft
does not double-gate on top of it.

## Known limitations

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
