# Design

## Context

- **What Phase 0 established** (Claude Code 2.1.299 in Desktop):
  - A mod's `$.mcp.call` to its own plugin's stdio server runs for at least 180 s with no host cancel.
  - In auto mode that call is refused unless the session's project settings allow the tool. A mod approving itself is treated as a bypass.
  - Plugin MCP servers appear as `mcp__plugin_<plugin>_<server>__<tool>` and are addressed as `plugin:<plugin>:<server>`.
- **Runtime:** Homebrew Node 26.10, which strips TypeScript types by default. `.ts` files run directly as long as they use only erasable syntax (no `enum`, `namespace` or parameter properties) and import with `.ts` extensions.
- **Verified live (2026-10-19).**
  - `health` reports key found and `gpt-6.1-sol` available.
  - A `low`-effort two-step turn worked: a `Read` function call, then `function_call_output` sent with `previous_response_id`, then the final text. The response went `queued` → `in_progress` → `completed` within 3–4 s per step and cost $0.0008.
  - The real response bodies matched the parser with no changes. The bodies are now fixtures `src/bridge/fixtures/live-*.json`; the other fixtures, still written from the docs, cover cases the live run didn't produce (incomplete, bad arguments, long prompt).
- **Gate result (2026-10-19, Claude Code 2.1.299 in the Desktop Code tab, plugin loaded from `dev-mods`).**
  - All four `mcp__plugin_gpt_bridge__*` tools were listed. `health` reported key found and model available (2.0 s).
  - An `xhigh` turn on `gpt-6.1-sol`, with `wait_ms` 45000: `turn` 45.2 s, `wait` 45.2 s, `wait` 45.6 s, `wait` 21.4 s → `completed`, about 2 min 52 s in all. The result had text (about 2,500 words) and `costUsd` 0.062658 (114 input and 6,243 output tokens).
  - A second `xhigh` turn: `turn` with `wait_ms` 5000 returned `in_progress` (5.2 s), then `cancel` returned `cancelled` (0.4 s). A later `wait` showed zero usage and `costUsd` 0.
  - Every call returned within 50 s. Total reported cost was $0.0627. Times come from the session transcript's tool-call timestamps.

## Goals / Non-Goals

**Goals:**

- A bridge the Phase 2 mod can drive with `turn` → `wait`* → result, inside 45 s MCP calls.
- Unit tests that need no network. One live check that needs a key.

**Non-Goals:**

- No conversation state in the bridge beyond what OpenAI stores. The response `id` and `previous_response_id` are the thread.
- No streaming and no OpenAI SDK.

## Decisions

- **Layout.** `src/` is the plugin root:
  - `src/.claude-plugin/plugin.json` (`name: "gpt"`)
  - `src/.mcp.json`, declaring server `bridge` as `node ${CLAUDE_PLUGIN_ROOT}/bridge/index.ts`
  - `src/package.json` (dependency `@modelcontextprotocol/sdk`)
  - `src/bridge/{index,responses,key}.ts`, each with a `*.test.ts` beside it

  The tools then become `mcp__plugin_gpt_bridge__{turn,wait,cancel,health}`. Allow rules name all four, because the wildcard form is unverified for plugin servers.
- **MCP SDK for the protocol, `fetch` for OpenAI.** The SDK handles protocol-version negotiation, which has broken hand-rolled servers before (fixed in 2.1.302). OpenAI needs only three calls, so a client library adds nothing.
- **Responses API usage.** These request and response shapes come from OpenAI's docs. Verify them against the first live fixture (task 5.2).
  - Create: `POST /v1/responses` with `background: true`, `store: true`, `reasoning: { effort }` and the caller's fields passed through. `input` is a string on the first step, then an array of `{ type: "function_call_output", call_id, output }`.
  - Poll: `GET /v1/responses/{id}` until `status` is one of `completed | failed | cancelled | incomplete`. `queued` and `in_progress` keep waiting. Backoff starts at 1 s, ×1.5, capped at 5 s, and never sleeps past the `wait_ms` deadline.
  - Cancel: `POST /v1/responses/{id}/cancel`.
  - Parse `output[]`: `message` items contribute their `output_text` parts to `text`; `function_call` items become `calls` (`arguments` parsed as JSON); `reasoning` items are ignored in this phase.
  - Usage: `input_tokens`, `input_tokens_details.cached_tokens` and `output_tokens`. Cost is `(input − cached)×$2 + cached×$0.10 + output×$10` per million. Prompts over 272K tokens bill at 2× input and 1.5× output.
- **Key: Keychain first, env override.** `execFile('/usr/bin/security', ['find-generic-password', '-s', 'openai', '-w'])`, run without a shell and read once per process. `OPENAI_API_KEY` in the bridge's environment wins, for tests and CI. The alternative, `settings.json` `env`, was rejected because it puts the key in every session's environment, where any Bash call can read it. Errors are built from status codes and OpenAI's message only, never from request headers.
- **Tests use `node:test` with an injected `fetch`.** The client takes `fetch` as a parameter, so tests replay recorded JSON fixtures in `src/bridge/fixtures/`. Server tests connect an SDK `Client` over the SDK's in-memory transport. There's no vitest; Node's built-in runner is enough.
- **Loading in Desktop during development.** The `dev-mods` symlink `gpt` is repointed from `scratchpad/spike-mod` to `src`. Both are plugin `gpt`, so only one can be loaded. This needs Ben's OK, because the spike mod is being kept loaded for now.

## Risks / Trade-offs

- [The Responses API fields for `gpt-6.1-sol` may differ from the docs used here] → The first live run records fixtures. Parsing is adjusted to them before the gate.
- [A 45 s poll means up to 45 s of cancel latency] → `cancel` is its own call, which the Phase 2 mod sends on interrupt without waiting for the poll.
- [The allow rule lives in whichever project the session started in] → The install note says to add it at the session's project root, or in user settings.
- [Live tests cost money] → One small `low`-effort turn per live run. The 3-minute gate turn is run once, by hand.

## Open Questions

- **Dev loop for the bridge (observed 2026-10-19, Desktop 2.1.299).** Mod hooks hot-reload at the end of a turn, but a plugin's MCP servers don't. `/reload-plugins` reports "Plugin MCP server changes take effect in your next session." Servers do start when a session first enables its `dev-mods` folder, which is how the Phase 0 sleep server started. So each bridge change needs a new session to test in Desktop. The tests and the CLI (`--plugin-dir`) are the fast path.
- **Cache-write pricing.** Live usage reports `input_tokens_details.cache_write_tokens`, which `costUsd` ignores. Check whether OpenAI bills cache writes separately; if it does, add a rate.
- **Linux key storage (required, follow-up change).** The bridge must also read the key from Linux keyrings, through the freedesktop Secret Service API (gnome-keyring, KWallet, KeePassXC) via `secret-tool lookup service openai`. Still open: the fallback for headless hosts with no D-Bus session or unlocked keyring. `getKey` already takes the keyring reader as a parameter, so a platform switch is a local change.
