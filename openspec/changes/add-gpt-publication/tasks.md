# Tasks

## 1. Private material

- [x] 1.1 Untrack `docs/` and `data/`, and add both to `.gitignore`. Verify: `git ls-files docs data` is empty, and the files are still on disk.
- [x] 1.2 Remove the employer's name, its repository names, `/Users/...` paths and the work email from tracked files. Set `opensource@blward.com` in `plugin.json` and `marketplace.json`. Verify: a `git grep` for the employer's name, its repository names, home-directory paths and the workspace folder's name prints nothing.

## 2. Bridge on Node alone

- [x] 2.1 Replace the SDK server in `src/bridge/index.ts` with the stdio JSON-RPC layer. Move the SDK, the test script and the lockfile to a root `package.json`, and set `engines.node` to `>=24.2`. Verify: `npm test` passes. A copy of `src/` without `node_modules` answers `initialize`, `tools/list` and `health` over stdio.

## 3. Linux keys

- [x] 3.1 Carry out `add-linux-keyring` tasks 1–3, with the docs in the root README, and checks 3.1 and 3.2 in a Linux container. Archive it. Verify: `openspec validate --strict` passes.

## 4. Public files

- [x] 4.1 Move `src/README.md` to `README.md`, and rewrite it for outsiders. It covers: what it is, requirements, install, key setup (macOS, Linux, `OPENAI_API_KEY`), permissions by mode, auto mode with server review vs the local classifier, costs, limitations, the `repos/` note, and development.
- [x] 4.2 Add an MIT `LICENSE` and a `SECURITY.md`. Set version 0.2.0 with a CHANGELOG entry. Add `license`, `repository`, `homepage` and `keywords` to `plugin.json`. Rename the marketplace to `gpt-subagents`, and give it a description. Verify: the version test passes.

## 5. Checks

- [x] 5.1 `claude plugin validate src` and `claude plugin validate .` pass. `npm test` and `claude plugin test src` are green. `openspec validate --strict` passes.
- [x] 5.2 Clean-clone install: clone the repository into the scratchpad. With an isolated `CLAUDE_CONFIG_DIR`, add it as a marketplace and install `gpt@gpt-subagents`. Run the installed bridge with Node: `health` reports `key: "found"`. (2026-10-20: a git URL can't be local, so the clone was added as a folder; the cache copy had no `node_modules`, and `health` gave `{"version":"0.2.0","key":"found","model":"available"}`. The GitHub install itself is task 6.3.)
- [x] 5.3 Build branch `publish`: one parentless commit of `main`'s final tree, authored and committed by Ben Ward `<github@blward.com>`. Verify: `git rev-list --count publish` is 1, and the task 1.2 grep over `publish` prints nothing.

## 6. Ben's steps (outward)

- [ ] 6.1 `gh repo create WardBenjamin/gpt-subagents-for-claude-code --public`, then `git push -u <remote> publish:main`.
- [ ] 6.2 `git tag -a v0.2.0 -m "gpt v0.2.0" publish`, then `git push <remote> v0.2.0`.
- [ ] 6.3 Re-add the local marketplace (renamed `gpt-subagents`), or install from GitHub, and check `health` in a new session.

## Workflow follow-up

- Archive this change once task 6 is done.
