# Spec Delta

## Purpose

How the `gpt` Claude Code plugin is packaged, installed and versioned: a one-plugin marketplace in its repository, a user-scope install that every session loads, and one semantic version across the plugin, its bridge and its changelog.

## ADDED Requirements

### Requirement: Installable from its own marketplace
The repository SHALL hold a marketplace file, `.claude-plugin/marketplace.json`, named `gpt-subagents`, that lists exactly one plugin, `gpt`, with source `./src`. Adding the repository folder as a marketplace and installing `gpt@gpt-subagents` at user scope SHALL load the plugin, with its agent types, `/gpt` command and bridge, in every new local session: Desktop, CLI and VS Code.

#### Scenario: Fresh session after install
- **WHEN** the plugin is installed at user scope and Ben opens a new Desktop session
- **THEN** `gpt:sol`, `gpt:astra` and `gpt:luna` are in Claude's agent listing and the bridge's `health` tool answers, with no dev-mods link and no hot-reload prompt

#### Scenario: Edit reaches sessions without reinstall
- **WHEN** a file under `src/` changes and Ben runs `/reload-plugins`
- **THEN** the session runs the changed hooks module, with no new install or version needed

### Requirement: One version everywhere
The plugin's `plugin.json` version, `package.json` version, the bridge's reported version (its MCP server info and `health`), and the top entry of `src/CHANGELOG.md` SHALL be the same semantic version.

#### Scenario: Versions drift
- **WHEN** `package.json` says 1.0.1 and `plugin.json` says 1.0.0
- **THEN** `npm test --prefix src` fails, naming both versions

### Requirement: Release by tag
Each released version SHALL have a `src/CHANGELOG.md` entry listing the user-visible changes since the previous version, taken from the Conventional Commits (`feat` under Added, `fix` under Fixed, anything breaking under Changed), and an annotated git tag `v<version>` on the commit that sets it.

#### Scenario: Releasing 1.0.0
- **WHEN** the plugin is released as 1.0.0
- **THEN** `src/CHANGELOG.md` starts with a `1.0.0` entry, every version field says 1.0.0, and tag `v1.0.0` points at that commit
