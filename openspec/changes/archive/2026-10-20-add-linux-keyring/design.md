# Design

## Context

- `src/bridge/key.ts` exports `getKey(env = process.env, read = keychain)`. It returns `env.OPENAI_API_KEY` if set. Otherwise it calls `read()`, which runs `/usr/bin/security find-generic-password -s openai -w` through `execFile` (no shell) and resolves to the trimmed output, or `undefined` on any error. Only a hit is cached, in a module variable, so a key added later is picked up without a restart. A miss throws `NO_KEY`, a fixed macOS message.
- `src/bridge/index.ts` only calls `getKey()`. `health` reports a thrown error's message as `key: "missing"`; every other tool returns it as a tool error. So new key sources and messages stay inside `key.ts`.
- `src/bridge/key.spec.ts` injects `read`, so no test touches a real Keychain.
- The bridge is spawned by Claude Code and inherits its environment. Exporting `OPENAI_API_KEY` for it therefore puts the key in every session command's environment too, which `add-gpt-bridge` rejected for macOS.

## Goals / Non-Goals

**Goals:**

- Linux desktops use the keyring with no extra setup beyond storing the key.
- Headless Linux hosts work without exporting the key into the session's environment.
- Every new branch is tested with injected readers, on any OS, without a keyring.

**Non-Goals:**

- Detecting *why* the Secret Service gave nothing. Any failure falls through to the file.

## Decisions

- **Platform switch in `getKey`.** `getKey(env, read, platform = process.platform)`. The default `read` and the no-key message both follow `platform`: `linux` uses the Linux reader and message; anything else keeps today's Keychain reader and `NO_KEY`. Tests pass `platform` to check both messages on any OS. The env override and hit-only caching are unchanged.
- **Linux reader: Secret Service, then the file.** `linuxKey(env, lookup = secretTool)` returns `await lookup()`, else the key file's contents.
  - `secretTool` runs `execFile('secret-tool', ['lookup', 'service', 'openai'], { timeout: 15_000 })`, without a shell, and resolves to the trimmed stdout or `undefined` on any error, timeout or empty output. stderr is discarded. The 15 s bound keeps a hung D-Bus call from eating a whole 45 s tool call, and leaves time for a desktop unlock prompt. Only the first call after start pays it, because a hit is cached.
  - The file is `${env.XDG_CONFIG_HOME || env.HOME + '/.config'}/gpt/openai-key`, per the XDG Base Directory spec. A missing file means no key. If `stat` shows any group or other permission bits (`mode & 0o077`), the reader throws an error naming the path and `chmod 600 <path>`, built without reading the contents. Otherwise it returns the trimmed contents, or `undefined` if empty.
- **Headless fallback: a `0600` file, not `pass` and not env only.** The open decision from `add-gpt-bridge`.
  - *`pass`* stores each secret as a GPG-encrypted file. Decrypting needs `gpg-agent` to hold the passphrase or to prompt through `pinentry`. The bridge is a stdio server with no terminal, so pinentry cannot prompt and decryption fails, the same failure as a locked keyring. It works only with a warm agent cache or a passphrase-less GPG key, which is a plaintext file with extra steps. It also adds `gpg` and `pass` as setup dependencies. Rejected.
  - *Env only* needs no code. But on a headless host the only way to give the bridge `OPENAI_API_KEY` is to export it where Claude Code starts, which exposes it to every command the session runs, in `/proc/<pid>/environ` and in child processes. That is the exposure `add-gpt-bridge` rejected. It stays as the explicit override, not as the Linux fallback.
  - *A `0600` file* is the established pattern for CLIs on hosts without a keyring: `gh` writes its token to `~/.config/gh/hosts.yml` when no credential store works. It costs one `stat` and one read. It is plaintext at rest, but any process running as the user can already read an unlocked keyring item with `secret-tool lookup`, or the macOS item with `security`. So against same-user processes it adds no new exposure. Unlike the environment, it is not handed to every child process. Chosen.
  - Sources relied on: the `gh auth login` manual (cli.github.com/manual/gh_auth_login) for the plaintext fallback; Ubuntu Launchpad bug 1420914 ("secret-tool does not run on headless system") for the D-Bus autolaunch failure; the password-store mailing list (lists.zx2c4.com/pipermail/password-store/2015-September/001740.html) and GnuPG issue T2680 (dev.gnupg.org/T2680) for pinentry failing without a terminal.
- **Linux no-key message.** Names `secret-tool store --label='OpenAI API key' service openai` and the `libsecret-tools` package, then the resolved key file path with `install -m 600 /dev/null <path>` to create it empty and owner-only, then `OPENAI_API_KEY`. Fixed text plus the path, so it can't carry a key.

## Risks / Trade-offs

- [The key file is plaintext on disk and in backups] → The reader refuses a file others can read, and the docs present the file as the headless fallback only, after the keyring.
- [Claude's own Bash calls can `cat` the file] → The same holds for `secret-tool lookup` on an unlocked keyring and for `security` on macOS. The bridge's threat model already excludes same-user processes.
- [`secret-tool lookup` on a locked keyring may hang, prompt or fail; the sources don't settle which] → The 15 s timeout bounds it either way. Task 3.2 records the actual behavior on a headless host.

## Linux check (2026-10-20)

Run in Docker (`node:26-trixie-slim`, Node 26.12, `libsecret-tools`, `gnome-keyring`, `dbus`) as a non-root user, against a copy of `src/` with no `node_modules`, three times. The stored keys were test values, so OpenAI answered 401. That answer, with the key shown as `[redacted]`, is the evidence that the bridge read the key: `health` reports `key: "found"` only when the model check gets past authentication.
- **3.1, Secret Service:** in a `dbus-run-session` with gnome-keyring unlocked, after `secret-tool store … service openai` and with no key file, `health` sent the stored key: 401, `[redacted]`. Three runs out of three; about 0.3 s each.
- **3.2, headless, no D-Bus session:**
  - With no file, `health` gave `key: "missing"` and the Linux message, naming `secret-tool store` and `/home/u/.config/gpt/openai-key`.
  - With a `0644` file, it named the path and `chmod 600`.
  - With a `0600` file, the key was sent (401, `[redacted]`).
  - Each answered in under 0.3 s.
  - `secret-tool lookup` **failed fast**: "Cannot autolaunch D-Bus without X11 $DISPLAY", exit 1, in 3 ms. The 15 s timeout wasn't reached.
