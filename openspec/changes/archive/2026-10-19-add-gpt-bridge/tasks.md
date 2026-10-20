# Tasks

## 1. Plugin skeleton

- [x] 1.1 Create `src/.claude-plugin/plugin.json` (`name: "gpt"`), `src/.mcp.json` (server `bridge` → `node ${CLAUDE_PLUGIN_ROOT}/bridge/index.ts`), and `src/package.json` with `@modelcontextprotocol/sdk`, then run `npm install` in `src/`. Verify: `claude plugin validate src` passes.

## 2. Responses client

- [x] 2.1 Write `src/bridge/responses.ts`: create, get and cancel with an injected `fetch`, 429/5xx retry inside a deadline, output parsing (`text`, `calls`, `args`/`argsError`) and `costUsd`. Verify: `node --test src/bridge/responses.test.ts` covers completed, function calls, bad JSON args, incomplete, 429-then-success and 400.
- [x] 2.2 Add long-polling to the client: poll until a terminal status or `wait_ms`, with backoff capped at 5 s. Verify: a test with a fake clock returns `in_progress` at the deadline and `completed` on a later call.

## 3. Key

- [x] 3.1 Write `src/bridge/key.ts`: `OPENAI_API_KEY`, else Keychain item `openai` via `execFile`, else a "no OpenAI key" error naming the item. Verify: `node --test src/bridge/key.test.ts` covers the env override and a missing key, and no error text contains the key.

## 4. MCP server

- [x] 4.1 Write `src/bridge/index.ts`: a stdio server exposing `turn`, `wait`, `cancel` and `health` over the client and key. Verify: `node --test src/bridge/index.test.ts` drives every tool through an SDK `Client` on the in-memory transport, against stubbed `fetch`.
- [x] 4.2 Add `src/README.md` with the install steps: the Keychain item command, the allow rules for the four bridge tools at the session's project root, and the Node ≥ 23.6 requirement. Verify: each command in it runs as written on Ben's Mac, except the key value.

## 5. Live

- [x] 5.1 Ben adds the Keychain item `openai` with an API key that can use `gpt-6.1-sol`. Verify: `health` run from the CLI reports `key: "found"` and `model: "available"`.
- [x] 5.2 Run one `low`-effort live turn, with one function tool, through the bridge. Save the raw responses as fixtures and fix any parsing mismatch. Verify: the fixtures replay green in 2.1 and 4.1.

## 6. Desktop gate

- [x] 6.1 With Ben's OK, repoint the `dev-mods` `gpt` symlink to `src/` and add the four bridge tools to the session root's allow rules. Verify: Claude's tool list shows the four `mcp__plugin_gpt_bridge__*` tools.
- [x] 6.2 Gate: in the Desktop Code tab, Claude starts an `xhigh` turn that runs about 3 minutes (`turn`, then `wait` until done), and `cancel` stops a second one. Verify: every MCP call returns within 50 s, the final result has text and `costUsd`, and the cancelled turn reports `cancelled`.

## Workflow follow-up

- Archive this change after the gate, then propose Phase 2 (the GPT tool loop and the Agent intercept).
