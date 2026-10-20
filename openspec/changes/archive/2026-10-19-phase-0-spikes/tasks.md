# Tasks

## 1. Setup

- [x] 1.1 Read the Claude Code release notes 2.1.289–2.1.304 for changes to mods, the Agent tool, MCP timeouts, or non-Claude providers. Verify: each relevant change is noted in design.md Context, or "none found" is written there.
- [x] 1.2 Load the `plugin-authoring` skill and save this build's `claude-code.d.ts` into `scratchpad/spike-mod/`. Verify: the file names the `tool.call`, `agent.offer`, `$.agent.register` and `$.mcp.call` signatures.
- [x] 1.3 Scaffold `scratchpad/spike-mod/` (plugin.json, hooks/hooks.json, hooks/register.ts, .mcp.json, sleep-server.mjs). Verify: `claude plugin validate scratchpad/spike-mod` passes.
- [x] 1.4 Symlink `scratchpad/spike-mod` into the session's `~/.claude/dev-mods/<session-id>/gpt`. Ben enables hot reloading when asked. Verify: the mod's `session.start` log line appears.

## 2. Spike 3: register and intercept

- [x] 2.1 Register `sol` with `$.agent.register` at `session.start`. Verify: Claude's agent listing in the new session shows `gpt:sol` with its description.
- [x] 2.2 Intercept `Agent` calls for `gpt:*`, with a `.catch` that denies. Make the hook throw on purpose. Verify: the call is denied, and no Claude subagent starts (no task row, no subagent transcript).

## 3. Spike 1: answer the Agent tool

- [x] 3.1 Capture a real Agent result record from a normal subagent dispatch with a logging `tool.call` hook. Verify: the full record is saved to `scratchpad/spike-mod/agent-result.json`.
- [x] 3.2 Return a hook-built record (copied from 3.1) for `gpt:sol`. Verify: core accepts it, and Claude's next turn quotes the record's text. Note whether a task row or spinner is drawn.

## 4. Spike 2: long MCP calls

- [x] 4.1 From the hook, `$.mcp.call` the sleep tool at 45 s, 55 s and 90 s in Desktop. Verify: the outcome and elapsed time of each call are logged. Note whether Claude's own direct MCP call to the same tool hits the same ceiling.

## 5. Decide

- [x] 5.1 Record every result in design.md under Spike results, along with the go/no-go for the mod route and the chosen `wait_ms`. Verify: each spike has a version, a runtime, a result and evidence.
- [x] 5.2 Remove the dev-mods symlink. Verify: a new session has no `gpt:sol` agent. Done 2026-10-19: the `gpt` link was repointed to `src/` (bridge only, no `gpt:sol`), and the gate session showed no `gpt:sol`. The `mcp__plugin_gpt_sleep__sleep` allow rule stays in the parent workspace's `.claude/settings.local.json` until Ben removes it.

## Workflow follow-up

- If it's a go, propose the Phase 1 (bridge) change. If it's a no-go, propose the fallback route from design.md.
- Archive this change.
