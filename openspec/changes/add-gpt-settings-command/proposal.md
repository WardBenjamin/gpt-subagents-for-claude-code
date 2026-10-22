# Proposal

## Why

The plugin's settings can't be changed from inside the Claude desktop app:
- Desktop's `/config` opens a settings screen that doesn't list plugin options.
- The Customize window's plugin **Settings** tab only reads and saves options for plugins from a claude.ai account or an admin marketplace. A marketplace the user added gets no tab. In Desktop 2.1.308 the tab calls `readPluginOptions`, which returns nothing unless the plugin is among the account's remote plugins.
- Desktop sessions also expose no plugin rows to mods: `$.config.list()` returns them only in an interactive terminal session.

Today the only route is the shell (`claude plugin configure … --values-stdin`) or editing `settings.json`. A running session does pick up the change, though. Desktop runs Claude Code as an SDK session, and in one, a change to an installed plugin's options in user settings reloads the plugin within about 60 ms: `register` runs again with the new options, and `session.start` re-registers the agent types. This was checked on Claude Code 2.1.308.

## What Changes

- **`/gpt settings`** lists the plugin's settings with the values this session is running on, and what each one accepts. It also shows the resulting web mode.
- **`/gpt settings <name> <value>`** checks the value against the setting's type, then saves it the way the surface allows:
  - **Terminal:** where the session has `/config` rows for the plugin, through `$.config.set`. That's the same path as `/config`, so the engine writes the value and reloads the plugin.
  - **Desktop and SDK sessions:** otherwise, by running `claude plugin configure <id> --values-stdin` through `$.process.run`. The `claude` binary is the session's own (`CLAUDE_CODE_EXECPATH`), or `claude` on the PATH. The id comes from `claude plugin list --json`: matched by install path, or else the one enabled plugin named `gpt`, since a folder-marketplace plugin runs from its folder while the list reports a cache copy. A plugin loaded with `--plugin-dir` isn't listed, so it's `gpt@inline`. Claude Code then reloads the plugin when it sees the settings change.
- **Applies now.** The reply says the value is saved and applies from this session's next GPT step. Other open sessions pick it up too, since the value is in user settings. If a session doesn't reload, `/reload-plugins` applies it.
- Booleans take `on`, `off`, `true` or `false`. Numbers must be above 0. `effort` takes one of its options.

**Out of scope:**
- **Queuing `/reload-plugins` from the command.** The engine refuses `$.command.run` inside a `command.run` hook ("it would wait on the turn this hook is holding"), and the reload happens without it.
- **A drawn settings pane.** The text command works on every surface.
- **Desktop's own Settings tab.** That needs a claude.ai or admin-marketplace plugin, or a change in Desktop.
- **Calling `/update-config`.** It's Claude Code's prompt-only skill for editing `settings.json`. It loads the settings schema, `pluginConfigs` included, and Claude then edits the file with its own tools, under the session's permissions. A mod can't call it, and it writes raw JSON without checking values against `userConfig`. The README offers it as the conversational route ("ask Claude to turn on GPT cache-only web"), and the automatic reload applies that edit as well.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-agents`: `/gpt` gains a `settings` subcommand that lists and changes the plugin's settings.

## Impact

- `src/hooks/register.ts`: the `settings` subcommand, value checks against the manifest's `userConfig`, the two save paths, and plugin-id lookup.
- `src/hooks/gpt-command.ts`: settings listing text, value parsing, and usage text.
- Tests for each path, invalid values, and id lookup.
- `README.md`: Settings explains `/gpt settings`, with the shell, `settings.json` and asking Claude (`/update-config`) as alternatives.
