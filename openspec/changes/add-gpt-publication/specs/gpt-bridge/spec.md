# Spec Delta

## ADDED Requirements

### Requirement: Run on Node alone
The bridge SHALL start with Node 24.2 or later and no installed packages, and SHALL serve MCP over stdio (newline-delimited JSON-RPC 2.0): `initialize`, `tools/list`, `tools/call` and `ping`, with `notifications/cancelled` cancelling the named call. Any other method SHALL get a JSON-RPC "method not found" error.

#### Scenario: Started from a git install
- **WHEN** the plugin folder has no `node_modules` and Claude Code starts the bridge
- **THEN** the handshake succeeds and the bridge's four tools are listed

#### Scenario: Call cancelled
- **WHEN** the client sends `notifications/cancelled` for a running `turn`
- **THEN** the bridge aborts that call, cancels its OpenAI response, and sends no response for it
