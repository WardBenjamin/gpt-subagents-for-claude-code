# Proposal

## Why

The `gpt` plugin is ready for other people to use, but the repository isn't ready to be public:
- it installs only from a local folder, because the bridge needs `node_modules`, which a git install doesn't copy;
- it has no LICENSE, and no README at the repository root;
- tracked notes name the author's employer, its repositories and local paths, and every commit carries a work email;
- the Linux key store is planned but not built.

## What Changes

- **Install from GitHub with no setup step.** The bridge stops depending on `@modelcontextprotocol/sdk` at run time and speaks MCP over stdio itself. The SDK stays a dev dependency, so the tests still drive the bridge with the SDK's client. `engines` becomes Node 24.2 or later, the first version with `import.meta.main`.
- **Public names.** The repository is `WardBenjamin/gpt-subagents-for-claude-code`, and its marketplace is renamed `gpt-subagents`. The plugin stays `gpt`, so `gpt:sol`, `gpt:astra`, `gpt:luna` and the `mcp__plugin_gpt_bridge__*` allow rules don't change.
- **Version 0.2.0, a preview.** `add-gpt-release` keeps its dogfood gate and the 1.0.0 release.
- **Files for outsiders.** A root `README.md` (moved from `src/`), an MIT `LICENSE`, a `SECURITY.md`, and repository, homepage, license and keyword metadata in `plugin.json` and `marketplace.json`.
- **Private material out.** `docs/` and `data/` become untracked and gitignored, but stay on disk. Employer names and local paths are removed from tracked files. Contact emails become `opensource@blward.com`.
- **Fresh history.** The public repository starts from a single commit authored as `github@blward.com`. It's built locally as branch `publish` and pushed by Ben.
- **Linux keys.** `add-linux-keyring` is carried out and checked in a Linux container.

**Out of scope:**

- Creating the GitHub repository, pushing, tagging or announcing. Those are Ben's steps (task 6).
- Renaming the plugin.
- The dogfood gate and the 1.0.0 release (`add-gpt-release`).
- Rewriting the private history in place. It stays on local `main`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-bridge`: runs on Node alone, with no installed packages.
- `gpt-distribution`: installs from the public repository.

## Impact

- **Code:** `src/bridge/index.ts` (the MCP stdio layer), and `src/package.json` (no dependencies, `engines`), and a root `package.json` and lockfile holding the test-only SDK.
- **Files:** `README.md`, `LICENSE`, `SECURITY.md` and `.gitignore` at the root; `src/CHANGELOG.md`, `src/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`; OpenSpec text scrubbed.
- **Ben's machine:** the folder marketplace's name changes from `gpt-agents` to `gpt-subagents`, so the local install has to be re-added (Ben's step).
