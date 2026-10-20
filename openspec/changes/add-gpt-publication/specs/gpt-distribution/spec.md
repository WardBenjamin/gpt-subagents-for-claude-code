# Spec Delta

## ADDED Requirements

### Requirement: Install from the public repository
Running `claude plugin marketplace add WardBenjamin/gpt-subagents-for-claude-code` and then `claude plugin install gpt@gpt-subagents` SHALL install a working plugin, with no build or `npm install` step. The repository SHALL carry an MIT `LICENSE`, and `plugin.json` SHALL name its license, repository and homepage.

#### Scenario: Clean clone
- **WHEN** a user with Node 24.2 or later installs from a fresh clone and has an OpenAI key stored
- **THEN** a new session lists `gpt:sol`, `gpt:astra` and `gpt:luna`, and the bridge's `health` reports `key: "found"`
