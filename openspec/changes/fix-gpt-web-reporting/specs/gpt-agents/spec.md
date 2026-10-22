# Spec Delta

## MODIFIED Requirements

### Requirement: Web access through OpenAI's tooling
When web access is on, the plugin SHALL give GPT OpenAI's hosted `web_search` tool in each request, run by OpenAI under its own site access and safeguards. It SHALL NOT offer GPT Claude Code's `WebFetch` or `WebSearch`. Each web action GPT takes (a search query, or a page opened or searched) SHALL appear as text in the subagent's transcript at that step.

When a run used the web, the report Claude receives, as a hand-back or as final text, SHALL end with a "Web activity (at OpenAI):" list. The plugin SHALL build that list from OpenAI's record of the run's responses, not from GPT's text. It SHALL hold every search and every page opened or searched in the run, then each cited page GPT didn't open, marked as found in search results or not seen. With web access on, GPT's instructions SHALL tell it to say it opened a page only if it did, and to say so when a fact comes only from search results.

#### Scenario: GPT searches
- **WHEN** web access is on and GPT searches for "Claude Code mods release notes" before answering
- **THEN** the step's text in the subagent transcript names that search, and no Anthropic request is made for it

#### Scenario: Web access off
- **WHEN** web access is off
- **THEN** GPT's requests carry no `web_search` tool

#### Scenario: Cited but not opened
- **WHEN** in auto mode GPT searches once, opens one page, and cites that page and a second one that appeared only in the search's sources
- **THEN** the hand-back message ends with the search, the opened page, and the second page marked "cited, not opened (in search results)"
