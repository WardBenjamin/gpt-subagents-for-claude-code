# Proposal

## Why

The `gpt` plugin's bridge (its stdio MCP server) reads the OpenAI API key from `OPENAI_API_KEY` in its own environment, else from the macOS Keychain item `openai`. On Linux there is no Keychain, so the only option today is to export `OPENAI_API_KEY`, which then sits in the environment of the Claude Code session and of every command it runs. Linux support is required, and it should keep the key out of that environment as macOS does.

## What Changes

- On Linux, the bridge reads the key from the freedesktop Secret Service with `secret-tool lookup service openai` (from `libsecret-tools`). gnome-keyring, KWallet and KeePassXC all implement the Secret Service.
- On headless Linux, where there is no D-Bus session or the keyring is locked, the bridge falls back to a key file, `$XDG_CONFIG_HOME/gpt/openai-key` (`~/.config/gpt/openai-key` when the variable is unset). The bridge refuses the file unless only its owner can read it (mode `0600` or narrower).
- macOS keeps the Keychain. `OPENAI_API_KEY` in the bridge's environment still overrides every store.
- The "no OpenAI key found" error names the store and the command to fill it for the platform the bridge runs on. It never contains the key.
- The install notes gain the Linux steps.

**Out of scope:**

- Writing or rotating the key from the bridge. Users store it with `secret-tool store` or by creating the file.
- `pass`, the kernel keyring (`keyctl`) and `systemd-creds` as key stores.
- Unlocking a locked keyring on the user's behalf.
- Windows and other platforms. They keep using `OPENAI_API_KEY` only.
- Any change to the bridge's tools, the Responses API client, or how a found key is cached.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-bridge`: adds Linux key sources (Secret Service, then the key file) and a per-platform "no key" error. Its Keychain requirement is narrowed to macOS (MODIFIED), and the Linux requirements are added.

## Impact

- **Code:** `src/bridge/key.ts` and `src/bridge/key.spec.ts`. No other module changes, because the server only calls `getKey()`.
- **Dependencies:** no new npm packages. Linux hosts that use a keyring need `secret-tool`, packaged as `libsecret-tools` on Debian and Ubuntu and as part of `libsecret` on Fedora and Arch.
- **Docs:** `src/README.md` and `docs/openai-key-keychain.md` gain the Linux setup.
- **Security:** the key file holds the key in plain text at rest. It is a fallback for hosts without a usable keyring, and the docs say so.
