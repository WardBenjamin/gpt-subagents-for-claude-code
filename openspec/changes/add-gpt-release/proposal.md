# Proposal

## Why

The `gpt` plugin works, but only through a per-session dev loop:
- each session links `src/` into its own mods folder;
- Ben enables hot reloading;
- the bridge starts only in a fresh session;
- the bridge allow rules work only in the folder the session started in.

That's fine for building, but no good for daily use. It also has no version story, and nothing has shown it holds up on real work.

## What Changes

- **One-plugin marketplace.** The repository root gets `.claude-plugin/marketplace.json`, which lists the `gpt` plugin with `"source": "./src"`.
- **User-scope install.** `claude plugin marketplace add <repo folder>` then `claude plugin install gpt@gpt-agents`, so every session loads it: Desktop, CLI and VS Code. A folder marketplace is read live from that folder, so an edit plus `/reload-plugins` reaches sessions with no reinstall. The bridge's allow rules move to user settings, where every session sees them. The per-session dev-mods links are retired.
- **Versioning.** Semantic versions, kept equal in `plugin.json`, `package.json` and the bridge's reported version, and checked by a test. `src/CHANGELOG.md` gets an entry per version, drawn from the Conventional Commits since the last one. A release is an annotated git tag `v<version>`; pushing it is Ben's call. The plugin goes to `1.0.0` when the dogfood gate passes.
- **Dogfood gate.** Ten real tasks on private repositories, across `gpt:sol`, `gpt:astra` and `gpt:luna`, from Desktop and at least once from the CLI. Each is logged with its type, effort, mode, outcome, cost and any problem. The gate passes when every run's report reaches Claude, no run falls through to a Claude model (`subagent_tokens: 0`), and the problems found are fixed or recorded.
- **Spec tidy-up.** The `gpt-agents` requirement "GPT answers every model step" grew past the 500-character limit in Phase 3. It's split, with model routing and effort as their own requirement, and no change in behavior.

**Out of scope:**

- Publishing to GitHub (`gh repo create`, a public or private marketplace). That's Ben's call. A git install would also need a bundled bridge, because it copies the repository without `node_modules`.
- Linux key storage (`add-linux-keyring`).
- New features.

## Capabilities

### New Capabilities

- `gpt-distribution`: how the `gpt` plugin is packaged, installed and versioned.

### Modified Capabilities

- `gpt-agents`: one long requirement split in two, with the same behavior.

## Impact

- **Files:** `.claude-plugin/marketplace.json` (new, at the repository root), `src/CHANGELOG.md` (new), a version test in `src/bridge/`, `src/README.md` (install section), `data/2026-10-dogfood.md` (the dogfood log).
- **Ben's machine:**
  - the marketplace added and the plugin installed at user scope;
  - the four bridge allow rules added to `~/.claude/settings.json`;
  - the old allow rules in the parent workspace's and this repository's `.claude/settings.local.json` removed, along with the spike's leftover `sleep` rule.

  Each settings edit needs Ben's yes.
- **Cost:** the ten dogfood runs. At Sol and Luna rates most cost cents. Astra runs are capped by the cost setting.
