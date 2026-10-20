# Tasks

## 1. Package

- [x] 1.1 Add `.claude-plugin/marketplace.json` at the repository root (`name: "gpt-agents"`, owner Ben Ward, one plugin `gpt` with source `./src`). Verify: `claude plugin validate .` passes and lists the `gpt` plugin.
- [x] 1.2 Add `src/CHANGELOG.md` with a `0.x` summary entry, and `src/bridge/version.spec.ts` asserting that `plugin.json`, `package.json` and the changelog's top version are equal. Verify: `npm test --prefix src` passes, and fails when one version is changed by hand.

## 2. Install (Ben's machine; each settings edit needs Ben's yes)

- [x] 2.1 Run `claude plugin marketplace add <repo folder>` and `claude plugin install gpt@gpt-agents` at user scope. Verify: `claude plugin list` shows `gpt@gpt-agents` read from the folder.
- [x] 2.2 Add the four `mcp__plugin_gpt_bridge__*` allow rules to `~/.claude/settings.json`. Remove them, and the `mcp__plugin_gpt_sleep__sleep` rule, from the parent workspace's and this repository's `.claude/settings.local.json`. Remove the dev-mods `gpt` links. Verify: a new Desktop session, in auto mode and started in a folder other than the parent workspace, lists the three `gpt:*` types, and `health` answers with no prompt. (2026-10-20: done, except the Desktop check. Verified from the CLI (2.1.304, auto mode, started in `gpt-in-claude-code`, whose own local rules are removed): `health` gave `{"version":"0.1.0","key":"found","model":"available"}`, all three types were listed, and a `gpt:luna` run reported `LUNA OK` with `subagent_tokens: 0`. A new Desktop session still has to confirm it.) Desktop confirmed 2026-10-20 (Claude Code 2.1.299, Desktop app 2.42304.2, auto mode, session process in `gpt-in-claude-code`): `gpt:sol`, `gpt:astra` and `gpt:luna` listed; `health` gave `{"version":"0.1.0","key":"found","model":"available"}` with no prompt; no link under `~/.claude/dev-mods/*/gpt`. Desktop with `CLAUDE_CODE_AUTO_MODE_SERVER=0` (project `.claude/settings.local.json` env) checked 2026-10-20: all three `gpt:*` descriptions say auto mode "reviews its actions with the local classifier, like Claude's, so it can edit in auto mode too"; a `gpt:luna` (effort low) Write of `scratchpad/dogfood/desktop-server0.txt` succeeded with no permission prompt, the file reads `HELLO`, the report came back through SubagentHandback with no "classifier was unavailable" note, and `subagent_tokens: 80`.
- [x] 2.3 Rewrite `src/README.md`'s install section around the marketplace (CLI and Desktop steps, allow rules in user settings, no dev-mods link while installed). Verify: the steps work as written in 2.1–2.2.

## 3. Spec tidy-up

- [x] 3.1 No code change: applied the split of "GPT answers every model step" into routing and effort. Verify: after archive, `openspec validate gpt-agents --type spec --strict` passes with no long-requirement warning.

## 4. Dogfood gate

- [ ] 4.1 Run ten real tasks on private repositories with the installed plugin, at least three per type, one or more from the CLI, and one or more in auto mode (expecting read-only behavior there). Log every run in `data/2026-10-dogfood.md` (kept locally, not published). Verify: every run's report reached Claude, every run has `subagent_tokens: 0`, and every problem found is fixed (with its commit in the log) or recorded as a follow-up.

## 5. Release

- [ ] 5.1 Set version 1.0.0 in `plugin.json` and `package.json`, add the `1.0.0` changelog entry, commit `chore(release): v1.0.0`, and tag `v1.0.0` (annotated, not pushed). Verify: the version test passes, `git describe` gives `v1.0.0`, and `/gpt` and `health` report 1.0.0 after `/reload-plugins` and a new session.

## Workflow follow-up

- Archive after the release. (3.1 was applied to `specs/gpt-agents` directly on 2026-10-20, with add-gpt-publication.)
- Publishing (a GitHub repository, git-source install, a bundled bridge) is Ben's call and a change of its own.
