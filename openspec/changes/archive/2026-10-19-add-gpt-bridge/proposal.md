# Proposal

## Why

Phase 0 showed that a Claude Code mod can answer `Agent(subagent_type: "gpt:sol")` itself, and that a mod's `$.mcp.call` can run for at least 180 s in the Desktop Code tab. The mod still has no way to reach GPT. A single GPT-6.1 Sol turn at `xhigh` or `max` effort can run for minutes, and the mod's own network call (`$.http.fetch`) is capped at 30 s. So every OpenAI call needs to live in a process that can wait: a stdio MCP server bundled with the plugin.

## What Changes

- A new plugin `gpt` at `src/`, holding only the bridge in this phase. The mod comes in Phase 2.
- **gpt-bridge**: a stdio MCP server that runs GPT turns on OpenAI's Responses API in background mode. It has four tools:
  - `turn`: start a response, then wait up to `wait_ms`.
  - `wait`: keep waiting on a response.
  - `cancel`: stop a response.
  - `health`: report auth and model access.
- The OpenAI key is read from the macOS Keychain, so it never appears in a Claude Code session's environment.
- An install note covers the Keychain item and the permission allow rule that auto mode needs before the mod can call the bridge.

**Out of scope:**

- The mod: GPT's tool loop, the `Agent` intercept, `gpt:*` registration, hiding the bridge's tools from Claude, and `SendMessage` to `gpt-*` ids (Phase 2).
- `/gpt` UX, `userConfig`, the cost ledger (Phase 3).
- Release packaging and marketplace (Phase 4).
- Streaming, image input, non-Responses OpenAI endpoints, and Cowork cloud sessions.
- Linux keyrings. They are required, but come in a follow-up change; see design.md Open Questions.

## Capabilities

### New Capabilities

- `gpt-bridge`: the plugin's local MCP server that runs and tracks GPT turns on the OpenAI Responses API for the mod.

### Modified Capabilities

None.

## Impact

- **New code:** `src/.claude-plugin/plugin.json`, `src/.mcp.json`, `src/bridge/*.ts`, plus tests next to them. Node 26 runs `.ts` directly, so there's no build step.
- **Dependency:** `@modelcontextprotocol/sdk`. OpenAI is called with the built-in `fetch`, with no `openai` package.
- **Ben's machine:**
  - A Keychain item `openai` holding an OpenAI API key with access to `gpt-6.1-sol`.
  - Allow rules for the four `mcp__plugin_gpt_bridge__*` tools in the session project's settings.
  - The Phase 0 spike mod is also named `gpt`, so it must be unloaded before `src/` is loaded.
- **Cost:** live tests make real OpenAI calls (a few cents each). Unit tests use recorded fixtures.
