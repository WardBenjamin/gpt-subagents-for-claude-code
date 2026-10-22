# Spec Delta

## MODIFIED Requirements

### Requirement: Offer gpt:sol as an agent type
The plugin SHALL register the agent type `gpt:sol` at session start, with the tools `Read`, `Edit`, `Write` and `Bash`, plus `WebSearch` and `WebFetch` when web access is on, and a description saying it runs GPT-6.1 Sol, takes effort `low` to `max`, and whether auto mode lets it edit in this session. That is so when `CLAUDE_CODE_AUTO_MODE_SERVER` is set and is not `1`, `true`, `yes` or `on`, which turns auto mode's server review off for the session.

#### Scenario: Listed for Claude
- **WHEN** a session with the plugin loaded starts
- **THEN** Claude's agent listing includes `gpt:sol` with that description

#### Scenario: Local review named
- **WHEN** a session starts with `CLAUDE_CODE_AUTO_MODE_SERVER=0`, from the shell or from settings `env`
- **THEN** the description says auto mode reviews GPT's actions with its local classifier, like Claude's

#### Scenario: Web tools listed
- **WHEN** a session starts with web access `cached` or `live`
- **THEN** `gpt:sol` is listed with `WebSearch` and `WebFetch` after its other tools, and its description says both run at OpenAI in that mode

### Requirement: Settings
The plugin SHALL read these settings from its `userConfig`, each shown in `/config`:
- effort: `inherit` (default) or `low` to `max`;
- step cap (default 60);
- cost cap in USD (default 5);
- web access: `off` (default), `cached` or `live`. A stored `true` SHALL read as `live`, and `false` or any unknown value as `off`.

A changed setting SHALL apply from the next GPT step.

#### Scenario: Effort setting changed
- **WHEN** the effort setting is changed to `low` in `/config`
- **THEN** the next GPT step runs at `low`

#### Scenario: Setting from an earlier version
- **WHEN** the stored web setting is `true`
- **THEN** GPT gets web access in `live` mode

## ADDED Requirements

### Requirement: Web modes
In `live` mode the plugin SHALL send OpenAI's `web_search` tool with its defaults. In `cached` mode it SHALL send it with `external_web_access: false`, so that OpenAI uses only cached content. In either mode, GPT's instructions SHALL say the web is available and that it should be used only when the task needs it, and never when the task says not to. The plugin SHALL refuse any `WebSearch` or `WebFetch` call from a `gpt:*` agent, so that Claude Code's web tools never run for GPT.

#### Scenario: Cached mode
- **WHEN** web access is `cached` and GPT takes a step
- **THEN** the request's `web_search` tool carries `external_web_access: false`

#### Scenario: Claude's web tool from a GPT agent
- **WHEN** a `gpt:*` agent issues a `WebFetch` call
- **THEN** the call is refused with a reason saying GPT's web access runs at OpenAI, and no Anthropic request is made
