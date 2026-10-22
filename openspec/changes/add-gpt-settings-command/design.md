# Design

## Context

Checked on Claude Code 2.1.308, the version Desktop bundles:
- **Plugin `/config` rows** come from the session's list of enabled plugins (`appState.plugins.enabled`). That list is filled in an interactive terminal session and empty in `-p` and SDK sessions, so `$.config.list()` has no plugin rows there. `$.config.set` rejects a key with no row.
- **An in-session `/config` or `$.config.set` change** writes `pluginConfigs` in user settings and reloads the plugin's hooks module at once. If the reload doesn't take, its message says "/reload-plugins applies it".
- **An outside change in an SDK session** (`claude plugin configure` writing `~/.claude/settings.json`) logs "Settings changed from userSettings", and the installed plugin's `session.start` runs again about 60 ms later. A probe plugin's `register` ran again too: its module counter restarted and it saw the new option.
- **`$.process.run`** runs `claude plugin configure` from a mod without a permission prompt, and its exit code is 0.
- **`$.command.run`** from a `command.run` hook is refused by the host.
- **Ids.** `claude plugin list --json` gives each installed plugin's `id`, `installPath` and `enabled`. A plugin from a folder marketplace runs from that folder (`$.plugin.root`), while the list reports the cache copy as `installPath`. A live check first wrote a folder-marketplace plugin's value under `gpt@inline` for this reason, so the one enabled `gpt@…` plugin is the fallback match. A `--plugin-dir` plugin isn't listed. Desktop configures those as `<name>@inline` with `--plugin-dir <root>`.

## Decisions

- **Show what's running.** The listing shows the values parsed from this activation's `options`, the ones the next step uses, rather than reading the settings file.
- **Rows first, shell second.** `$.config.set` goes through other plugins' `config.set` hooks and the engine's own lock checks, such as managed settings owning a value, so it's preferred wherever a row exists. The shell path is for surfaces without rows.
- **Strings on stdin.** `claude plugin configure --values-stdin` takes single-line strings and stores typed values, so booleans go as `"true"` or `"false"` and numbers as their decimal text.
- **Check before saving.** The command parses the value against the manifest's type first, so a bad value never reaches the settings file and the reply names what's accepted.
- **No reload call.** Both paths reload the plugin through the engine. The reply mentions `/reload-plugins` only as a fallback.

## Risks / Trade-offs

- [A reload during a GPT run] → Run records are kept in `$.state`, which survives a reload, and the bridge cancels a turn nobody polls. The reply suggests changing settings between runs.
- [`claude` isn't the session's binary] → `CLAUDE_CODE_EXECPATH` is used first. A failed run reports its exit code and stderr, redacted to 200 characters.
- [The automatic reload is undocumented behavior] → The live checks cover it, and the reply names `/reload-plugins` as the fallback.
