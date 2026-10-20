# Spec Delta

## MODIFIED Requirements

### Requirement: GPT answers every model step of a gpt subagent
For each model request of a subagent whose type starts with `gpt:`, the plugin SHALL send the request's new input to that type's model (`gpt:sol` → `gpt-6.1-sol`, `gpt:astra` → `gpt-6-astra`, `gpt:luna` → `gpt-6-luna`) and return GPT's response as the step's response, reporting no Anthropic token usage for it. It SHALL use the effort setting when that names a level, and otherwise the step's effort: the Agent call's, else the session's. It SHALL never send that request to an Anthropic model. Model requests of the main loop and of other agent types SHALL proceed unchanged.

#### Scenario: Dispatch
- **WHEN** Claude calls `Agent(subagent_type: "gpt:sol", effort: "high", prompt)`
- **THEN** a subagent starts, each of its steps is answered by GPT-6.1 Sol at `high` effort, and the subagent's Anthropic token usage is zero

#### Scenario: Other agents untouched
- **WHEN** an `Explore` subagent or the main loop makes a model request
- **THEN** it goes to its Anthropic model as it would without the plugin

#### Scenario: Each type uses its model
- **WHEN** Claude dispatches `gpt:luna`, and the effort setting is `medium`
- **THEN** its steps go to `gpt-6-luna` at `medium` effort, whatever effort the step carries

### Requirement: Cap steps and cost
The plugin SHALL end a run after the step-cap setting's number of GPT steps (default 60), or once its priced GPT cost reaches the cost-cap setting (default $5), with a report saying which cap was reached.

#### Scenario: Step cap
- **WHEN** GPT is still calling tools at its 60th step and the step cap is unset
- **THEN** the run ends with a report saying the 60-step cap was reached

#### Scenario: Lower cost cap
- **WHEN** the cost cap is set to $1 and a `gpt:astra` run's priced cost reaches $1
- **THEN** the run ends at its next step with a report saying the $1 cost cap was reached

## ADDED Requirements

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
