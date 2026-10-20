# Design

## Context

- The plugin is `src/`. The repository root holds the one-plugin marketplace `.claude-plugin/marketplace.json`, with source `./src`.
- A marketplace added from GitHub is cloned; installing a plugin copies its folder into the plugin cache. Neither runs `npm install`, so a git install has no `node_modules`.
- The bridge (`src/bridge/index.ts`) imports three things from `@modelcontextprotocol/sdk`: `Server`, `StdioServerTransport` and two request schemas. Its tests connect the SDK's `Client` through `InMemoryTransport`. The mod (`src/hooks/`) imports only types.
- `index.ts` starts the server only when `import.meta.main` is true, which needs Node 24.2. `engines` said 23.6.

## Decisions (Ben, 2026-10-20)

- **License:** MIT, copyright Ben Ward.
- **Repository:** `WardBenjamin/gpt-subagents-for-claude-code`, public. Marketplace `gpt-subagents`; plugin `gpt` unchanged.
- **Version:** 0.2.0, a preview. 1.0.0 waits for `add-gpt-release`'s dogfood gate.
- **Emails:** commits by `github@blward.com`; `opensource@blward.com` in `plugin.json` and `marketplace.json`.
- **History:** one fresh commit. All of `docs/` and `data/` leave history but stay on disk, gitignored.
- **Contents:** `src/`, `openspec/` (scrubbed), `.claude/` (OpenSpec commands), and the `repos/` submodules. The README says the submodules are reference code only and don't need initializing.
- **Install route:** no runtime dependencies.
- **Linux:** finish `add-linux-keyring` and test it in a container.

## Decisions (implementation)

- **A hand-written stdio MCP layer.** Messages are JSON-RPC 2.0, one per line. The bridge answers:
  - `initialize`, with the client's protocol version if it's one the bridge knows, else the newest it knows; `capabilities: { tools: {} }`; and `serverInfo`;
  - `tools/list` and `tools/call`;
  - `ping`.
  
  `notifications/cancelled` aborts that request's signal, and no response is sent for it. Other notifications are ignored, and other methods get error `-32601`. `createServer` keeps its signature and returns an object whose `connect(transport)` accepts the SDK's `Transport` shape (`onmessage`, `send`, `start`). The tests are unchanged, and the stdio transport is a few lines over `readline`.
- **Dev tooling lives at the repository root.** Claude Code installs a plugin's packages when the plugin folder has a `package.json` and a lockfile, devDependencies included (seen in the clean-clone check: 26 MB). So the SDK, the test script and the lockfile move to a root `package.json`. `src/package.json` keeps only the name, version, `type` and `engines`.
- **The README moves to the root.** GitHub shows it there; the plugin cache copy doesn't need it.
- **The keychain how-to joins the README.** `docs/` is untracked, so the README holds the key setup for macOS, Linux and `OPENAI_API_KEY`.
- **The publish branch is built with `git commit-tree`** from the final `main` tree, so no branch is switched in the shared checkout.

## Risks / Trade-offs

- [A future MCP revision changes the handshake] → The bridge offers only tools, the most stable part. The tests run the SDK client, so an SDK bump that breaks the handshake fails them.
- [A missed private string in the fresh commit] → Task 5 greps the `publish` tree for the employer's name, its repository names, `/Users/` and the work email.
- [Renaming the marketplace breaks Ben's local install] → Ben re-adds it. The allow rules keep working, because they're keyed by plugin name.
