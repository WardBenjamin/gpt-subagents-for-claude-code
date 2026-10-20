# gpt-agents Specification

## Purpose
Lets Claude delegate a task to a GPT model with the native Agent tool (`subagent_type: "gpt:sol"`). The result is a real Claude Code subagent whose model is GPT: it works on the session's tools under the session's permission rules, reports back through the native hand-back, and can be resumed with `SendMessage`.

## Requirements

### Requirement: Offer gpt:sol as an agent type
The plugin SHALL register the agent type `gpt:sol` at session start, with the tools `Read`, `Edit`, `Write` and `Bash`, and a description saying it runs GPT-6.1 Sol, takes effort `low` to `max`, and whether auto mode lets it edit in this session. That is so when `CLAUDE_CODE_AUTO_MODE_SERVER` is set and is not `1`, `true`, `yes` or `on`, which turns auto mode's server review off for the session.

#### Scenario: Listed for Claude
- **WHEN** a session with the plugin loaded starts
- **THEN** Claude's agent listing includes `gpt:sol` with that description

#### Scenario: Local review named
- **WHEN** a session starts with `CLAUDE_CODE_AUTO_MODE_SERVER=0`, from the shell or from settings `env`
- **THEN** the description says auto mode reviews GPT's actions with its local classifier, like Claude's

### Requirement: GPT answers every model step of a gpt subagent
For each model request of a subagent whose type starts with `gpt:`, the plugin SHALL send the request's new input to GPT and return GPT's response as the step's response, reporting no Anthropic token usage for it. It SHALL never send that request to an Anthropic model. Model requests of the main loop and of other agent types SHALL proceed unchanged.

#### Scenario: Dispatch
- **WHEN** Claude calls `Agent(subagent_type: "gpt:sol", effort: "high", prompt)`
- **THEN** a subagent starts, each of its steps is answered by GPT-6.1 Sol at `high` effort, and the subagent's Anthropic token usage is zero

#### Scenario: Other agents untouched
- **WHEN** an `Explore` subagent or the main loop makes a model request
- **THEN** it goes to its Anthropic model as it would without the plugin

#### Scenario: Each type uses its model
- **WHEN** Claude dispatches `gpt:luna`, and the effort setting is `medium`
- **THEN** its steps go to `gpt-6-luna` at `medium` effort, whatever effort the step carries

### Requirement: Route each type to its model and effort
A step of `gpt:sol` SHALL go to `gpt-6.1-sol`, of `gpt:astra` to `gpt-6-astra`, and of `gpt:luna` to `gpt-6-luna`. Its effort SHALL be the effort setting when that names a level, and otherwise the step's effort (the Agent call's, else the session's).

#### Scenario: Effort inherited
- **WHEN** the effort setting is `inherit` and Claude dispatches `gpt:astra` with `effort: "low"`
- **THEN** its steps go to `gpt-6-astra` at `low` effort

### Requirement: GPT's tool calls run as the subagent's own
The plugin SHALL return GPT's function calls as the step's tool calls, so the engine runs them with its hooks, permission check and dialog, as it would for a Claude subagent. It SHALL pass each tool's result back to GPT on the next step.

#### Scenario: Read then Edit
- **WHEN** GPT calls `Read` on a file, then `Edit` on it
- **THEN** both appear in the subagent's transcript as its tool calls, and GPT's next turn receives each result, or the refusal text

#### Scenario: Edit refused in auto mode
- **WHEN** the session is in auto mode with server review and GPT calls `Edit`
- **THEN** GPT receives the refusal text as the tool's result, and the file is unchanged

#### Scenario: Write reviewed locally
- **WHEN** the session is in auto mode with `CLAUDE_CODE_AUTO_MODE_SERVER=0` and GPT calls `Write` on a file in the project
- **THEN** the file is written as Claude's write would be, and GPT's hand-back is judged by auto mode's local classifier

### Requirement: Deliver the report in the form the engine offers
When GPT answers without calling a tool, the plugin SHALL deliver GPT's answer as the subagent's report. Where the engine offers the subagent `SubagentHandback`, the report SHALL be that tool call. Otherwise it SHALL be the turn's final text. If a `SubagentHandback` call is refused, the plugin SHALL re-send the report as final text.

#### Scenario: Report in acceptEdits mode
- **WHEN** GPT finishes with a summary in a session where the engine offers no `SubagentHandback`
- **THEN** Claude receives that summary as the subagent's report

#### Scenario: Report in auto mode
- **WHEN** GPT finishes with a summary in a session where the engine offers `SubagentHandback`
- **THEN** the summary is delivered through `SubagentHandback`

### Requirement: Follow-ups keep GPT's context
When a `gpt:*` subagent is resumed (for example by `SendMessage`), the plugin SHALL continue GPT from the response it gave last, sending only the new messages.

#### Scenario: Follow-up uses earlier context
- **WHEN** a `gpt:sol` subagent read a file, and Claude then sends it a question about that file's content
- **THEN** GPT answers from its earlier context without reading the file again

### Requirement: Never fall back to a Claude model
If a GPT step fails (the bridge errors, OpenAI fails, or a cap is reached), the plugin SHALL end the run with a hand-back report naming the reason. It SHALL NOT forward the step to an Anthropic model.

#### Scenario: Bridge unreachable
- **WHEN** the bridge can't be called
- **THEN** the subagent reports "GPT run failed" with the reason, and no Anthropic request is made for that subagent

### Requirement: Cap steps and cost
The plugin SHALL end a run after the step-cap setting's number of GPT steps (default 60), or once its priced GPT cost reaches the cost-cap setting (default $5), with a report saying which cap was reached.

#### Scenario: Step cap
- **WHEN** GPT is still calling tools at its 60th step and the step cap is unset
- **THEN** the run ends with a report saying the 60-step cap was reached

#### Scenario: Lower cost cap
- **WHEN** the cost cap is set to $1 and a `gpt:astra` run's priced cost reaches $1
- **THEN** the run ends at its next step with a report saying the $1 cost cap was reached

### Requirement: Stop on interrupt
When a `gpt:*` subagent is interrupted while GPT's response is in progress, that OpenAI response SHALL be cancelled. The plugin asks the bridge to cancel it, and the bridge also cancels when the polling request is cancelled or abandoned.

#### Scenario: Stop a running subagent
- **WHEN** the user stops a `gpt:sol` subagent mid-step
- **THEN** its in-progress OpenAI response ends `cancelled` within about a minute

### Requirement: Keep the bridge's run tools to the plugin
The plugin SHALL refuse Claude's own calls to the bridge's `turn`, `wait` and `cancel` with a reason pointing to `Agent(subagent_type: "gpt:sol")`. It SHALL leave `health` callable.

#### Scenario: Claude calls turn directly
- **WHEN** Claude calls `mcp__plugin_gpt_bridge__turn`
- **THEN** the call is denied with that reason, and no OpenAI request is sent

### Requirement: Offer gpt:astra and gpt:luna
The plugin SHALL also register `gpt:astra` (GPT-6 Astra, the strongest and priciest) and `gpt:luna` (GPT-6 Luna, the cheapest), with the same tools as `gpt:sol` and descriptions that say which model each runs and how it compares.

#### Scenario: Three types listed
- **WHEN** a session with the plugin loaded starts
- **THEN** Claude's agent listing includes `gpt:sol`, `gpt:astra` and `gpt:luna`

### Requirement: Settings
The plugin SHALL read these settings from its `userConfig`, each shown in `/config`:
- effort: `inherit` (default) or `low` to `max`;
- step cap (default 60);
- cost cap in USD (default 5);
- web access (default off).

A changed setting SHALL apply from the next GPT step.

#### Scenario: Effort setting changed
- **WHEN** the effort setting is changed to `low` in `/config`
- **THEN** the next GPT step runs at `low`

### Requirement: Web access through OpenAI's tooling
When web access is on, the plugin SHALL give GPT OpenAI's hosted `web_search` tool in each request, run by OpenAI under its own site access and safeguards. It SHALL NOT offer GPT Claude Code's `WebFetch` or `WebSearch`. Each web action GPT takes (a search query, or a page opened or searched) SHALL appear as text in the subagent's transcript at that step.

#### Scenario: GPT searches
- **WHEN** web access is on and GPT searches for "Claude Code mods release notes" before answering
- **THEN** the step's text in the subagent transcript names that search, and no Anthropic request is made for it

#### Scenario: Web access off
- **WHEN** web access is off
- **THEN** GPT's requests carry no `web_search` tool

### Requirement: Cost ledger
The plugin SHALL add each GPT step's priced cost to a ledger kept in plugin storage across sessions, grouped by calendar month and model, with run and step counts.

#### Scenario: Spend recorded
- **WHEN** a `gpt:sol` run costs $0.12 over 4 steps in October 2026
- **THEN** the ledger's 2026-10 entry for `gpt-6.1-sol` grows by $0.12, 1 run and 4 steps

### Requirement: The /gpt command
The plugin SHALL register the slash command `/gpt`. `/gpt status` SHALL list this session's GPT runs with type, state, steps and cost. `/gpt cost` SHALL show the ledger's current month and all-time totals by model. Any other argument SHALL show the usage.

#### Scenario: Status after a run
- **WHEN** one `gpt:sol` run finished with 3 steps at $0.02, and the user types `/gpt status`
- **THEN** the output lists that run as `gpt:sol`, done, 3 steps, $0.02
