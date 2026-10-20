# Design

## Context

**Target system (not built yet).** `gpt-agents` is a Claude Code plugin with two parts:

- **The mod** (TypeScript function hooks):
  - Registers the agent types `gpt:sol`, `gpt:astra` and `gpt:luna`.
  - Intercepts `Agent` calls whose `subagent_type` starts with `gpt:` and never calls `next`, so no Claude subagent starts.
  - Runs a loop: get GPT's next turn from the bridge, then execute each GPT function call with `$.tool.call`, which goes through Claude Code's own permission rules and dialog.
  - Answers the Agent call with a result record in the Agent tool's output schema.
- **The bridge:** a stdio MCP server in the same plugin. It holds `OPENAI_API_KEY` and makes every long network call to the OpenAI Responses API, using `background: true`, `store: true` and `previous_response_id`. Its tools are `turn`, `wait`, `cancel` and `health`. `turn` and `wait` long-poll and return `in_progress` before the host's timeout.

**Decisions already made (2026-10-19).**

- Build this design rather than wrapping `codex exec`. OpenAI's `codex-plugin-cc` is only an interim route.
- Mod plus bridge, not an LLM gateway and not MCP alone.
- All long waits live inside `$.mcp.call`.
- Agent names are `gpt:sol`, `gpt:astra` and `gpt:luna`. Effort uses Claude Code's vocabulary (`low | medium | high | xhigh | max`), which GPT-6.1 Sol also accepts.
- Target local sessions only: the Desktop Code tab first, the CLI second.
- Use the Responses API with an OpenAI API key. A ChatGPT-plan login won't work.

**Mods API limits the design relies on** (mods reference, Oct 2026):

| Limit | Value |
| --- | --- |
| Hook's own execution time | 10 s per event. Time inside `next` or a `$.*` API call doesn't count, except `$.clock.sleep`. |
| `$.http.fetch` | 30 s per call. |
| `$.process` | CLI only, so the desktop app can't use it. |
| `$.mcp.call` | Uses the engine's MCP connection. No permission prompt. |
| `tool.call` hook | May return `next(e)`, `{ deny }`, or `{ result }`. Core validates a `{ result }` against the tool's output schema when it has one. |
| `$.agent.register({ name })` | Yields `<plugin>:<name>`, which the Agent tool dispatches from the next turn on. A plugin's `agents/*.md` files also declare types. |

**Agent tool output record** (Claude Code 2.1.303 schema): `agentId`, `agentType`, `content: [{type:'text', text}]`, `status: 'completed'`, `usage`, `totalToolUseCount`, `totalDurationMs`, `totalTokens`, `resolvedModel`, `prompt`.

**Known risk behind spike 2.** A desktop-app issue (#63379, Claude Code 2.1.154, closed "not planned") reported stdio MCP calls cancelled at about 60 s, with `MCP_TOOL_TIMEOUT` ignored. Nobody has checked whether that still holds on current builds.

**Runtimes on 2026-10-19.**

- Desktop's bundled Claude Code is 2.1.299, which includes mods (added in 2.1.287).
- The CLI is 2.1.304 (Homebrew `claude-code@latest`).
- The authoritative type declarations come from this build's `plugin-authoring` skill, which writes `claude-code.d.ts`. The built-in mods in `repos/claude-code/mods/` are working examples.

**Release notes 2.1.289–2.1.304** (read 2026-10-19 from the Claude Code CHANGELOG):

- No release adds a non-Claude provider, and none changes the desktop MCP request timeout.
- **2.1.302: the desktop app always runs the main conversation's subagents in the background.** On 2.1.302 and later, a normal desktop Agent result is presumably an async "launched" record whose report arrives later as a notification, not the final report. Desktop 2.1.299 predates this, so spike 1 should capture the result record on both builds if Desktop updates.
- **2.1.301: a hook's `.catch` runs only when the hook itself throws or times out.** Events raised beneath the hook's own calls skip the hook without asking `.catch`. Desktop 2.1.299 predates this.
- **2.1.295: long MCP tool calls can move to the background**, with a task id and a notification. Spike 2 should note whether a long `$.mcp.call` is affected the same way.
- 2.1.292 added the Agent tool's `effort` parameter. `tool.call` hooks now see the repaired arguments the tool will run with.
- 2.1.302 fixed MCP servers that negotiate protocol `2026-07-28` but omit some fields. The spike's sleep server negotiates an older version to stay clear of this.

**Facts from this build's types (2.1.299, read 2026-10-19).**

- `$.agent.register({ name })` names the type `<plugin>:<name>`. To get `gpt:sol`, the plugin must be named `gpt`; a plugin named `gpt-agents` would produce `gpt-agents:sol`.
- The Agent tool's input has `run_in_background`, and agents run in the background by default. Its output is a union: `completed` (the final report), `async_launched` (with an `outputFile`), or `remote_launched`. A hook-built `completed` record answers synchronously even when Claude expected a background launch, and spike 1 must check that core accepts it.
- `$.mcp.call(server, tool, args)` takes the server's name as `/mcp` lists it. For a plugin's server that is probably `plugin:<plugin>:<server>`; the spike tries that first, then the bare name.

## Goals / Non-Goals

**Goals:**

- A yes/no answer, with evidence, for each spike in the Desktop Code tab.
- A measured `$.mcp.call` ceiling to set the bridge's `wait_ms` from.

**Non-Goals:**

- Production code, tests, or package structure.
- OpenAI calls or API keys.
- Full CLI parity. Run the CLI only for `claude plugin validate`, or where a check is easier to automate there.

## Decisions

- **One spike mod covers all three spikes.** Spike 1 needs the registration from spike 3 anyway. It lives in `scratchpad/spike-mod/` as `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hooks/register.ts`, plus `sleep-server.mjs`. Splitting it into three mods would only repeat the scaffolding.
- **A zero-dependency MCP sleep server for spike 2.** About 30 lines of Node that speak newline-delimited JSON-RPC (`initialize`, `tools/list`, `tools/call sleep{ms}`), declared in the spike plugin's `.mcp.json`. The alternative, `@modelcontextprotocol/sdk`, means an npm install for a throwaway.
- **The hook-built record copies a real one.** Spike 1 first captures a genuine Agent result from a normal Sonnet subagent, using a `tool.call` hook that logs `await next(e)`. The test record copies that shape and changes only the `agentId` (`gpt-` prefix), `agentType` and `resolvedModel`. This separates "schema rejects a hook-built record" from "my record was malformed".
- **Desktop first, hot-reloaded.** The spike mod is symlinked into the Desktop session's `~/.claude/dev-mods/<session-id>/` folder, which the `plugin-authoring` skill watches. After a one-time "Enable hot reloading" answer, the mod loads at the end of the turn and reloads on every save, with no edit to `settings.json` and no new session. The fallback is `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` plus a new session.

**Fallback per spike if the answer is no:**

| Spike | Fallback |
| --- | --- |
| 1. Record rejected | Register a `mcp__gpt-agents__dispatch` tool and teach Claude to call it through a SKILL.md. The `Agent(subagent_type: gpt:*)` grammar is lost; everything else stays. |
| 1. No task row | Accept it; the status line and the `/gpt` command stand in. |
| 2. Ceiling below 45 s | Set `wait_ms` to the measured ceiling minus a 10 s margin. |
| 3. Not in listing or fails validation | Add `agents/sol.md` declarations. If a Claude subagent can ever start in GPT's place, the route is a no-go and we fall back as for spike 1. |

## Risks / Trade-offs

- [The mods API is early access and changes between releases] → Record the exact Claude Code version next to every result, and re-run the spikes when a later build fails.
- [Desktop 2.1.299 is below the 2.1.303 the plan was researched on] → Read the 2.1.299–2.1.304 release notes for mods changes first. If Desktop updates mid-spike, note it.
- [The dev-mods watcher may not follow a symlink] → If the mod doesn't load, copy the folder instead, or fall back to `CLAUDE_CODE_PLUGIN_DIRS`.

## Spike results

_Filled in as the spikes run. For each spike: the Claude Code version, the runtime (Desktop or CLI), the result, the evidence (log line or screenshot), and the decision._

### 1.4 Load (Desktop, Claude Code 2.1.299): yes

- The mod was symlinked as `~/.claude/dev-mods/<session-id>/gpt` and loaded after Ben enabled hot reloading. The watcher follows the symlink.
- The engine wrote its types to `.claude-plugin/types/`, stamped "Written by Claude Code 2.1.299".
- The bundled server is connected as `plugin:gpt:sleep`. Claude's own tool list shows it as `mcp__plugin_gpt_sleep__sleep`, so it also appears as a model-facing tool; the real bridge must hide its tools.
- A hook edit takes effect only when the turn that made it ends. To switch spike modes within a turn, the hook reads a `[spike:<mode>]` tag from the Agent prompt.

### 2.1 Register (Desktop, Claude Code 2.1.299): yes

- After `$.agent.register({ name: 'sol', ... })` at `session.start`, Claude's agent listing showed `gpt:sol` with the registered description, listed with "(Tools: All tools)".
- No `agents/*.md` file was needed.

### 2.2 Intercept and deny on failure (Desktop, Claude Code 2.1.299): yes

- `Agent(subagent_type: "gpt:sol")` passed `subagent_type` validation and reached the mod's `tool.call` hook.
- With `[spike:throw]` in the prompt, the hook threw before calling `next`, and the `.catch` answered `{ deny }`. Claude got a tool error carrying exactly the mod's text: "gpt spike: the GPT run failed (deliberate .catch deny)".
- No Claude subagent started. No task row appeared, `ListAgents` showed no spawned agent, the session had no `subagents/` transcript folder, and the only occurrence of the canary word "FALLTHROUGH" in the session transcript is the prompt itself.
- Caveat: 2.1.301 narrows `.catch` to throws and timeouts of the hook itself. Re-check this on the next Desktop build.

### 3.1 Real Agent result captured (Desktop, Claude Code 2.1.299): yes

- A synchronous Explore dispatch (`run_in_background: false`) returned `status: 'completed'`.
- On this build a real subagent reports through a `SubagentHandback` message. Its record carries `handback: 'send'`, `handbackReport.text`, `harnessNoteCount`/`harnessSectionHash`, `toolStats` and `canContinueAgent`. Its `content` is only a pointer to the hand-back message.
- The full record is saved at `scratchpad/spike-mod/agent-result.json`.

### 3.2 Hook-built result accepted (Desktop, Claude Code 2.1.299): yes

- For `Agent(subagent_type: "gpt:sol", effort: "xhigh")`, the hook returned `{ result }` with only the documented `completed` fields: `agentId: gpt-…`, `agentType`, `content`, `resolvedModel`, the counts, `usage`, `status` and `prompt`.
- Core validated and stored it unchanged as the tool result, with no error. Claude saw it framed as a normal subagent hand-back, with `content` as the report, followed by `agentId`, a SendMessage hint, and a usage block.
- No Claude subagent ran: the session's `subagents/` folder holds only the 3.1 baseline.
- Two follow-ups:
  - Core tells Claude it can `SendMessage` the minted `gpt-…` id. Nothing answers that id yet, so v2 must either intercept `SendMessage` to `gpt-*` (to continue a run with `previous_response_id`) or deny it with a clear reason.
  - In the UI (Ben's screenshot), the desktop draws the call as a normal "Ran agent <description>" row, like a Claude agent's, but without the model label ("Haiku 5.5" on the baseline). The mod's `$.ui.log` line appears under it.

### 4.1a Claude's own direct MCP call (Desktop, Claude Code 2.1.299): no ~60 s cap

- Claude calling `mcp__plugin_gpt_sleep__sleep` directly completed at 45 003, 55 001, 90 004 and 180 003 ms. The ~60 s cancellation reported in #63379 (2.1.154) does not reproduce here. No ceiling was found up to 180 s.

### 4.1b The mod's own `$.mcp.call` (Desktop, Claude Code 2.1.299, auto mode): blocked by permissions

- From the `tool.call` hook, `$.mcp.call('plugin:gpt:sleep', 'sleep', …)` was refused within 4–12 ms at every duration (1, 45, 55, 90 and 180 s). The error: "auto mode classifier gave no verdict for mcp__plugin_gpt_sleep__sleep: the request that produced this action did not ask for one". A retry gave the same result.
- So the type docs' "no permission prompt: the plugin's call is the grant" does not hold in auto mode. A mod's MCP call goes through the session's permission check, and the classifier has no transcript request to judge it against.
- One way out is a `tool.check` hook in which the mod approves its own bridge tool when `next.origin` is itself. Auto mode refused even to validate that edit, flagging it as an "Auto-Mode Bypass", so it was reverted and not tested.
- The open question is how the bridge's tools get permission. The likely answer is an allow rule the person adds at install (`mcp__plugin_gpt_<bridge>__*`), not the mod approving itself. Untested: whether an allow rule satisfies auto mode for a mod-originated call, and how default mode treats one (would a dialog appear?).
- Timing is still unmeasured for the mod path. The direct-call result (4.1a) shows the host itself doesn't cancel at about 60 s.

### 4.1b retest with an allow rule (Desktop, Claude Code 2.1.299, auto mode): yes

- With `"permissions": { "allow": ["mcp__plugin_gpt_sleep__sleep"] }` in the session's project `settings.local.json`, the hook's `$.mcp.call` completed:
  - 1 s: 1 021 ms wall
  - 45 s: 45 019 ms
  - 55 s: 55 017 ms
  - 90 s: 90 027 ms
  - 180 s: 180 046 ms
- No ceiling was found up to 180 s.
- The rule only counts in the settings of the session's **project root**: where the session started, not a subfolder it later moved into. The same rule placed in `gpt-in-claude-code/.claude/` had no effect for a session started in the parent folder.

## Decision (2026-10-19): go

The mod route holds on Desktop 2.1.299. Spike 1: a hook can answer `Agent(gpt:sol)` with a record core accepts and draws as an agent row. Spike 2: a mod's `$.mcp.call` runs at least 180 s. Spike 3: `gpt:sol` registers, validates, and denies cleanly on failure, with no Claude-subagent fallthrough.

What Phase 1 and later must carry:

- **Bridge tools need an allow rule.** In auto mode the classifier refuses a mod's own MCP calls, and a mod approving itself through `tool.check` is treated as a bypass. Install docs must have the person add `mcp__plugin_gpt_<bridge>__*` to their allow rules. Default mode is untested: a mod-originated call might raise a dialog there.
- **`wait_ms` stays at 45 s.** The measured headroom is 4× or more. Shorter polls keep cancel latency low and stay under the ~60 s cap reported on older builds.
- **The plugin is named `gpt`**, so the types are `gpt:sol`, `gpt:astra` and `gpt:luna`.
- **Hide the bridge tools from Claude.** As a plugin MCP server they show up as model-facing `mcp__plugin_gpt_*` tools.
- **Handle `SendMessage` to `gpt-*` ids.** Core offers it after every result: continue the run with `previous_response_id`, or deny with a reason.
- **Re-run spikes 1–3 on the next Desktop build.** 2.1.301 changed `.catch` semantics, and 2.1.302 runs desktop subagents in the background.
