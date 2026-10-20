# Proposal

## Why

The goal is to make `Agent(subagent_type: "gpt:sol", effort: "xhigh", prompt)` in Claude Code run GPT-6.1 Sol inside the current session, on the session's own tools and permission rules. No native route exists: the Agent tool's `model` accepts only Claude models, and Anthropic does not support gateways to non-Claude models. The chosen route is a Claude Code mod plus a bundled MCP bridge to OpenAI's Responses API. It depends on three undocumented mod behaviors, so three throwaway spikes must confirm them before any real code is built.

## What Changes

- A throwaway spike mod in `scratchpad/`, loaded into the Claude Desktop Code tab, answers three questions:
  1. **Answer the Agent tool:** can a `tool.call` hook answer an `Agent` call with a hook-built result record that core accepts, and does the UI draw a task row for it?
  2. **Long MCP calls:** how long can a mod's `$.mcp.call` run in the desktop app before the host cancels it (test 45 s, 55 s, 90 s)?
  3. **Register and intercept:** does `$.agent.register` make `gpt:sol` pass `subagent_type` validation and appear in Claude's agent listing? And does a failing intercept deny, never falling through to a Claude subagent?
- The findings and a go/no-go for the mod route are recorded in `design.md` under **Spike results**.
- No spec deltas. The spikes change no system behavior (`skip_specs: true`).

**Out of scope.** Each later phase gets its own change once the spikes pass:

- Phase 1: the bridge (stdio MCP server over the Responses API).
- Phase 2: the GPT tool loop and the Agent intercept.
- Phase 3: `/gpt` UX and config.
- Phase 4: hardening and release.

Also out of scope:

- Cowork cloud sessions: desktop plugins don't reach them, and cloud egress blocks api.openai.com.
- Any real OpenAI call. The spikes need no API key.

## Capabilities

### New Capabilities

None. This is a feasibility spike.

### Modified Capabilities

None.

## Impact

- Files: only `scratchpad/spike-mod/` (gitignored) and this change's `design.md`.
- Local config: during the spikes, `~/.claude/settings.json` `env.CLAUDE_CODE_PLUGIN_DIRS` points at the spike mod. Remove it afterwards.
- Runtimes:
  - Claude Desktop's bundled Claude Code (2.1.299 on 2026-10-19) is the primary target.
  - The Homebrew `claude-code@latest` CLI (2.1.304) is used only for automated checks (`claude plugin validate` and `claude plugin test`).
