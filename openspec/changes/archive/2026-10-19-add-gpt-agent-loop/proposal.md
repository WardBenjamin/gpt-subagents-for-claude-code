# Proposal

## Why

The `gpt` plugin's bridge can run GPT-6.1 Sol turns on the OpenAI Responses API, but Claude can't delegate to GPT yet. Claude should be able to dispatch `Agent(subagent_type: "gpt:sol", effort, prompt)` and get a real Claude Code subagent whose model is GPT, with everything a Claude subagent has:
- its own transcript and task row;
- background running;
- Claude Code's tools under the session's permission rules;
- the hand-back report;
- `SendMessage` follow-ups.

A prototype showed that a mod's `turn.step` hook can answer every model request of such a subagent itself. No Anthropic request is made for those steps, and the engine runs the rest natively.

## What Changes

- A hooks module (the mod) in the `gpt` plugin at `src/hooks/`.
- **Register `gpt:sol`** as an agent type with the tools `Read`, `Edit`, `Write` and `Bash`. Claude dispatches it with the normal Agent tool, and core spawns a real subagent.
- **Substitute the model.** For every model step of a `gpt:*` subagent, the mod sends the step's new input to GPT through the bridge and streams GPT's answer back as the step's response: text, tool calls and stop reason. It never forwards the step to Anthropic. The engine then runs GPT's tool calls exactly as it runs Claude's.
- **Report.** GPT's final answer is delivered as the subagent's report, in the form the engine offers: `SubagentHandback` in auto mode, final text otherwise.
- **Follow-ups.** `SendMessage` to the subagent resumes it, and GPT continues from its stored response, keeping its full context.
- **Caps and abort.** Step and dollar caps per run, and the OpenAI response is cancelled on interrupt.
- **Failure.** A failure ends the run with a report naming it. It never falls back to a Claude model.
- **Guard.** Claude's own calls to the bridge's run tools are refused.

**Out of scope:**

- `gpt:astra` and `gpt:luna` (no prices yet, so no cost cap).
- `/gpt` commands, `userConfig` and a cost ledger (Phase 3).
- `WebFetch` and `WebSearch` for GPT: planned for Phase 3, along with `/gpt` UX, `userConfig`, the cost ledger, `gpt:astra` and `gpt:luna`. Until then GPT can reach the web only through `curl` in `Bash`, under the same permissions as Claude's (Reddit's thread page answers it, but its `.json` API returns 403).
- MCP tools for GPT, image input, and subagent compaction.
- Getting an auto-mode classifier verdict for GPT's actions. The classifier only judges actions produced by an Anthropic model request, so in auto mode GPT's `Edit` and `Write` are refused. This change documents that and points to the alternatives.
- Linux key storage (`add-linux-keyring`).

## Capabilities

### New Capabilities

- `gpt-agents`: Claude Code subagents whose model is GPT, dispatched with the native Agent tool and driven through the plugin's bridge.

### Modified Capabilities

- `gpt-bridge`: cancels an OpenAI response whose polling request is cancelled or abandoned, so a stopped subagent stops billing.

## Impact

- **New code:** `src/hooks/hooks.json`, `src/hooks/register.ts` and its modules, `src/types/index.d.ts`, and `claude plugin test` tests.
- **Claude-side cost** is only the main loop's own dispatch. GPT's steps make no Anthropic request (prototype: `subagent_tokens: 0`, and the session cost unchanged across steps).
- **Ben's machine:** the bridge allow rules stay required. In auto mode, `gpt:sol` can read, search and run project `Bash`, but its `Edit` and `Write` are refused. File-editing work needs `acceptEdits` or default mode, or the user's own allow rules for those tools.
