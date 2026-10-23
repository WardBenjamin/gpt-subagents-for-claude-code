# Spec Delta

## MODIFIED Requirements

### Requirement: Web access through OpenAI's tooling
When web access is on, the plugin SHALL give GPT OpenAI's hosted `web_search` tool in each request, run by OpenAI under its own site access and safeguards. It SHALL NOT offer GPT Claude Code's `WebFetch` or `WebSearch`. Each web action GPT takes (a search query, or a page opened or searched) SHALL appear as text in the subagent's transcript at that step. GPT's instructions SHALL tell it to say it opened a page only if it did, and to say so when a fact comes only from search results.

#### Scenario: GPT searches
- **WHEN** web access is on and GPT searches for "Claude Code mods release notes" before answering
- **THEN** the step's text in the subagent transcript names that search, and no Anthropic request is made for it

#### Scenario: Web access off
- **WHEN** web access is off
- **THEN** GPT's requests carry no `web_search` tool

#### Scenario: Cited but not opened
- **WHEN** in auto mode GPT searches once, opens one page, and cites that page and a second one that appeared only in the search's sources
- **THEN** the hand-back message ends with the search, the opened page, and the second page marked "cited, not opened (in search results)"

### Requirement: Settings
The plugin SHALL read these settings from its `userConfig`, each shown in `/config`:
- effort: `inherit` (default) or `low` to `max`;
- step cap (default 60);
- cost cap in USD (default 5);
- web access (default off);
- web cache-only (default off), which applies only while web access is on;
- web budget: `default` or `unlimited` (default `default`), which applies only while web access is on.

Web access off is the `off` mode, on is `live`, and on with cache-only is `cached`.

A changed setting SHALL apply from the next GPT step.

#### Scenario: Effort setting changed
- **WHEN** the effort setting is changed to `low` in `/config`
- **THEN** the next GPT step runs at `low`

#### Scenario: Setting from an earlier version
- **WHEN** the stored web setting is `true` and cache-only was never set
- **THEN** the plugin loads and GPT gets web access in `live` mode

### Requirement: Web modes
In `live` mode the plugin SHALL send OpenAI's `web_search` tool with its defaults. In `cached` mode it SHALL send it with `external_web_access: false`, so that OpenAI uses only cached content. With the web budget `unlimited`, it SHALL also send `return_token_budget: "unlimited"`. In either mode, GPT's instructions SHALL say the web is available and that it should be used only when the task needs it, and never when the task says not to. The plugin SHALL refuse any `WebSearch` or `WebFetch` call from a `gpt:*` agent, so that Claude Code's web tools never run for GPT.

#### Scenario: Cached mode
- **WHEN** web access is `cached` and GPT takes a step
- **THEN** the request's `web_search` tool carries `external_web_access: false`

#### Scenario: Unlimited budget
- **WHEN** web access is `live` and the web budget is `unlimited`
- **THEN** the request's `web_search` tool carries `return_token_budget: "unlimited"`

#### Scenario: Claude's web tool from a GPT agent
- **WHEN** a `gpt:*` agent issues a `WebFetch` call
- **THEN** the call is refused with a reason saying GPT's web access runs at OpenAI, and no Anthropic request is made

## ADDED Requirements

### Requirement: Report the run's web activity
When a run used the web, the report Claude receives SHALL end with a "Web activity (at OpenAI):" list built from OpenAI's record of the run. It SHALL hold each search with its result count, each page action with its pages, each cited page no action returned (found in search results, or not seen), and up to 5 of the web tool's notices. Each page SHALL count once across the run.

#### Scenario: Pages opened in a batch
- **WHEN** one `open_page` action returned 13 pages and GPT cites 3 of them
- **THEN** the list shows that action with 13 pages, and none of the 3 is marked "cited, not opened"

### Requirement: Suggest a larger web budget
When the web-activity list holds a notice from the web tool and the web budget is `default`, the list SHALL suggest `/gpt settings webBudget unlimited`.

#### Scenario: Budget notice
- **WHEN** the web tool returns a notice and the web budget is `default`
- **THEN** the list shows the notice and suggests `/gpt settings webBudget unlimited`
