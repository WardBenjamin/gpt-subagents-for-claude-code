# Design

## Context

- **The plugin** `gpt` is `src/`. It holds:
  - `.claude-plugin/plugin.json` (version 0.1.0, `userConfig`, `types`);
  - `hooks/` (the mod);
  - `.mcp.json`, which starts the bridge as `node ${CLAUDE_PLUGIN_ROOT}/bridge/index.ts` and depends on `node_modules/@modelcontextprotocol/sdk`;
  - `package.json` (version 0.1.0).

  Development loads it per session through a `~/.claude/dev-mods/<session>/gpt` link. MCP servers start only when a session first loads the plugin.
- **Plugin installs (Claude Code 2.1.299 docs):**
  - A marketplace is `.claude-plugin/marketplace.json`: `{ name, owner, plugins: [{ name, source }] }`.
  - A marketplace added from a folder, whose entry's source is a relative path, is read live from that folder: `/reload-plugins` re-reads it, with no new version or reinstall. Every other source (git, a URL) runs a copy made at install.
  - The commands are `claude plugin marketplace add <path> [--scope user]` and `claude plugin install <plugin>@<marketplace>`. In Desktop: +, Plugins, Add marketplace, Add plugin.
  - A user-scope install applies to the terminal, Desktop local sessions and VS Code.
- **Permissions:** a plugin can't grant itself permission rules. In auto mode, the mod's own calls to the bridge need the four `mcp__plugin_gpt_bridge__*` allow rules. In project settings they count only in the folder a session starts in. In `~/.claude/settings.json` they count everywhere.
- **No git remote** exists yet. `gh` is signed in as `WardBenjamin`.

## Goals / Non-Goals

**Goals:** one install that works in every local session, one version that can't drift, and evidence from real use.

**Non-Goals:** a GitHub release, a bundled bridge, auto-update.

## Decisions

- **The marketplace lives at the repository root**, with `"source": "./src"`. The plugin then stays the `src/` folder, and the marketplace name `gpt-agents` is the repository's, matching the original plan's name. A marketplace inside `src/` would also have worked, but it would put repository concerns inside the plugin.
- **The install is a folder marketplace at user scope.** Live reads keep the dev loop: edit, then `/reload-plugins`, then a new session for a bridge change. `node_modules` is already in the folder, so the bridge needs no bundling. A git or URL install would need `npm install`, or a bundled `bridge/dist`, first; that's left for publishing.
- **Retire the dev-mods links** once the install works. Two plugins named `gpt` in one session would collide, so the README says not to link `src/` into a session's mods folder while the plugin is installed.
- **Allow rules move to `~/.claude/settings.json`**, with Ben's yes. The project-local copies, and the spike's `mcp__plugin_gpt_sleep__sleep` rule, are removed then. The README's install section says user settings.
- **The version check is a Node test.** `bridge/version.spec.ts` reads `plugin.json`, `package.json` and the first `## ` heading of `CHANGELOG.md`, and asserts all three are equal. The bridge already reports `package.json`'s version in its server info and `health`.
- **The changelog** is Keep a Changelog style: `## 1.0.0 – 2026-10-xx`, then Added, Changed and Fixed, hand-written from `git log --format=%s` with the scopes `feat`, `fix` and `!`. The history before 1.0.0 is summarized as a single `0.x` entry rather than listing every commit.
- **Release steps:**
  1. set the versions;
  2. write the changelog entry;
  3. commit `chore(release): v1.0.0`;
  4. `git tag -a v1.0.0 -m "gpt v1.0.0"`.

  Pushing the commit and the tag is Ben's call.
- **Dogfood log:** `data/2026-10-dogfood.md`, a table with one row per run: date, surface (Desktop or CLI), mode, type, effort, task (one line), outcome (report delivered or not), `subagent_tokens`, cost (`/gpt status`), problems. Problems found are fixed in this change or recorded as follow-ups in the log, not left out.

## Risks / Trade-offs

- [The CLI is 2.1.304 and Desktop 2.1.299; behavior may differ (for example 2.1.301's `.catch` change, or 2.1.302's background subagents)] → At least one dogfood run is in the CLI, and its differences go in the log.
- [A folder marketplace ties the install to this checkout's path] → Accepted for personal use. Publishing moves to a git source.
- [The installed plugin keeps its `$.store` under its installed id (`gpt@gpt-agents`), so the cost ledger written while the plugin ran from dev-mods (`~/.claude/plugins/store/gpt_inline-*.json`) doesn't carry over] → Accepted: those were test runs. The ledger starts fresh at install.
- [Ten runs is a small sample] → The gate is about no fallthrough and delivered reports, not quality benchmarking. Quality notes go in the log.
