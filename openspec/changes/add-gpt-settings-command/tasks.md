# Tasks

## 1. Command

- [x] 1.1 `/gpt settings` lists each setting with its running value and what it accepts, plus the web mode. Verify: a mod test with given options.
- [x] 1.2 `/gpt settings <name> <value>` parses the value by the setting's type and rejects an unknown name or a bad value, naming what's accepted. Verify: mod tests for each type, and for bad input.
- [x] 1.3 Save through `$.config.set` where a `gpt.<name>` row exists, else through `claude plugin configure <id> --values-stdin` via `$.process.run`, with the id from `claude plugin list --json` by install path, or `--plugin-dir <root>` and `gpt@inline`. Verify: mod tests for both paths, both id cases, and a failed configure.

## 2. Docs

- [x] 2.1 README Settings: `/gpt settings` first, then the shell, `settings.json`, and asking Claude (which uses `/update-config`). Verify: the steps work as written.

## 3. Check

- [x] 3.1 Desktop-style (SDK) session: `/gpt settings webCacheOnly on`, then confirm the plugin reloaded and the `gpt:sol` listing names cache-only mode, in the same session. Verify: debug log and listing. (2026-10-22, Claude Code 2.1.308 SDK session in a throwaway config directory, with the branch installed from a folder marketplace. The value saved to `pluginConfigs["gpt@gpt-subagents"]`, "Settings changed from userSettings" was followed 70 ms later by `gpt:sol` being re-registered and `session.start` running again, and a second `/gpt settings` showed `webCacheOnly on` and `Web mode: cached`. The first run had saved under `gpt@inline`, because a folder-marketplace plugin runs from its folder; the enabled-id fallback fixed it.)
- [ ] 3.2 Terminal session: the same through `$.config.set`. Verify: the value saved and the plugin reloaded. (Open: a throwaway config directory stops at first-run sign-in, so this needs a signed-in terminal session. A mod test covers the path, and Claude Code 2.1.308's `/config` writer reloads the plugin after saving.)
