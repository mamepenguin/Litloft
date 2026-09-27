# Invariants — ChatGPT Secure MCP Tunnel

## Touch points

- MCP tool definitions and their `tools/list` metadata.
- The stdio MCP server's tool registration.
- The operator runbook for a private ChatGPT developer-mode connection.

## Invariants

1. Every advertised tool declares complete read-only, destructive,
   idempotency, and open-world hints.
2. Tools that replace or relocate existing library data, or move it to trash,
   are marked destructive; permanent deletion remains unavailable.
3. Operations that can send data beyond Litloft, including Ask through a
   configured LLM provider and URL clipping, are marked open-world. Ask's tool
   description discloses the possible excerpt transfer.
4. Every tool continues to call Litloft's existing public `/api/*` surface with
   the configured Bearer token. No API, authorization, drive-boundary, or
   validation bypass is added.
5. Secure MCP Tunnel remains an outbound transport. The runbook does not expose
   Litloft publicly or recommend sending its Bearer token over plaintext LAN
   HTTP.
6. The integration remains usable without a custom ChatGPT UI and becomes
   unavailable when Litloft or `tunnel-client` is offline.
