# Spec Delta

## Purpose

Lets Claude delegate a task to a GPT model with the native Agent tool (`subagent_type: "gpt:sol"`). The result is a real Claude Code subagent whose model is GPT: it works on the session's tools under the session's permission rules, reports back through the native hand-back, and can be resumed with `SendMessage`.

## ADDED Requirements

### Requirement: Offer gpt:sol as an agent type
The plugin SHALL register the agent type `gpt:sol` at session start, with the tools `Read`, `Edit`, `Write` and `Bash`, and a description saying it runs GPT-6.1 Sol and takes effort `low` to `max`.

#### Scenario: Listed for Claude
- **WHEN** a session with the plugin loaded starts
- **THEN** Claude's agent listing includes `gpt:sol` with that description

### Requirement: GPT answers every model step of a gpt subagent
For each model request of a subagent whose type starts with `gpt:`, the plugin SHALL send the request's new input to GPT-6.1 Sol and return GPT's response as the step's response, reporting no Anthropic token usage for it. It SHALL never send that request to an Anthropic model. Model requests of the main loop and of other agent types SHALL proceed unchanged.

#### Scenario: Dispatch
- **WHEN** Claude calls `Agent(subagent_type: "gpt:sol", effort: "high", prompt)`
- **THEN** a subagent starts, each of its steps is answered by GPT-6.1 Sol at `high` effort, and the subagent's Anthropic token usage is zero

#### Scenario: Other agents untouched
- **WHEN** an `Explore` subagent or the main loop makes a model request
- **THEN** it goes to its Anthropic model as it would without the plugin

### Requirement: GPT's tool calls run as the subagent's own
The plugin SHALL return GPT's function calls as the step's tool calls, so the engine runs them with its hooks, permission check and dialog, as it would for a Claude subagent. It SHALL pass each tool's result back to GPT on the next step.

#### Scenario: Read then Edit
- **WHEN** GPT calls `Read` on a file, then `Edit` on it
- **THEN** both appear in the subagent's transcript as its tool calls, and GPT's next turn receives each result, or the refusal text

#### Scenario: Edit refused in auto mode
- **WHEN** the session is in auto mode and GPT calls `Edit`
- **THEN** GPT receives the refusal text as the tool's result, and the file is unchanged

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
The plugin SHALL end a run after 60 GPT steps, or once its priced GPT cost reaches $5, with a hand-back report saying which cap was reached.

#### Scenario: Step cap
- **WHEN** GPT is still calling tools at its 60th step
- **THEN** the run ends with a report saying the 60-step cap was reached

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
