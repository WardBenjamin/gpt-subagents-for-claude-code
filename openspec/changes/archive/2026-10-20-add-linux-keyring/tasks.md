# Tasks

## 1. Linux reader

- [x] 1.1 In `src/bridge/key.ts`, add `secretTool` (`execFile('secret-tool', ['lookup', 'service', 'openai'], { timeout: 15_000 })`, no shell, trimmed stdout or `undefined`) and `linuxKey(env, lookup = secretTool)`, which returns the lookup's key, else reads `$XDG_CONFIG_HOME/gpt/openai-key` (`$HOME/.config/...` when unset). Verify: `node --test src/bridge/key.spec.ts` passes with an injected `lookup` and a temp-dir `XDG_CONFIG_HOME`, covering: a lookup hit skips the file; a miss reads a `0600` file and trims its newline; `XDG_CONFIG_HOME` unset resolves under the injected `HOME`; a missing or empty file gives `undefined`.
- [x] 1.2 Make `linuxKey` refuse a key file with any group or other permission bits, throwing an error that names the path and `chmod 600` and is built without reading the file. Verify: a test writes a known key to a `0644` file, and asserts the rejection names the path and `chmod 600` and does not contain the key.

## 2. Platform switch and messages

- [x] 2.1 Change `getKey` to `getKey(env, read, platform = process.platform)`: on `linux` the default reader is `linuxKey` and the no-key error is the Linux message (the `secret-tool store` command, `libsecret-tools`, the resolved file path with `install -m 600 /dev/null <path>`, and `OPENAI_API_KEY`); other platforms keep the Keychain reader and `NO_KEY`. Verify: `node --test src/bridge/key.spec.ts` passes, with existing tests unchanged plus: on `linux`, `OPENAI_API_KEY` skips the reader; a miss throws the Linux message, which names the store command and path and contains no key; on `darwin` a miss still throws `NO_KEY`; and `npm test --prefix src` stays green.
- [x] 2.2 Add the Linux setup to the root `README.md`: store with `secret-tool store --label='OpenAI API key' service openai`, check with `secret-tool lookup service openai > /dev/null && echo found`, and for headless hosts create the file with `install -m 600 /dev/null ~/.config/gpt/openai-key` before writing the key into it. Verify: each command runs as written in task 3.1 or 3.2, except the key value.

## 3. Linux check

- [x] 3.1 On a Linux desktop session with gnome-keyring, KWallet or KeePassXC, store a key with `secret-tool store` and start the bridge with `OPENAI_API_KEY` unset. Verify: `health` reports `key: "found"`.
- [x] 3.2 On a headless Linux host or container with Node 26 and `libsecret-tools` but no D-Bus session: call `health` with no key file, then with a `0644` file, then with a `0600` file. Verify: the first names the `secret-tool` command and file path, the second names `chmod 600`, the third reports `key: "found"`, and each returns within 20 s. Note in design.md whether `secret-tool lookup` failed fast or hit the timeout.

## Workflow follow-up

- Archive this change once 3.1 and 3.2 pass.
