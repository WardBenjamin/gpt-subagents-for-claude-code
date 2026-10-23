# Tasks

## 1. Setting and requests

- [x] 1.1 Add a `webCacheOnly` switch beside `web` in `plugin.json`: `web` off is `off`, on is `live`, and on with cache-only is `cached`, which sends `{ type: "web_search", external_web_access: false }`. Keep `web` a boolean, since the engine refuses a stored option that no longer fits its declared type. Verify: mod tests for live, cached, off, and cache-only with web off.

## 2. Listing and guard

- [x] 2.1 With web on, register the `gpt:*` types with `WebSearch` and `WebFetch` after `Read`, `Edit`, `Write` and `Bash`, and a description in the proposal's terms that names the mode. Verify: a mod test checks the registered tools and description per mode, and a new CLI session lists the types with those tools.
- [x] 2.2 Refuse `WebSearch` and `WebFetch` tool calls from `gpt:*` agents in the `tool.call` hook. Verify: a mod test sends a fake call from a `gpt:*` agent and gets the refusal, while Claude's own `WebSearch` passes through.
- [x] 2.3 Add the web instruction to GPT's instructions in `cached` and `live` modes. Verify: a mod test.

## 3. README

- [x] 3.1 Write the "Web access" section: the modes with their OpenAI settings, the mapping to `WebSearch` and `WebFetch`, how to switch in `/config` and in `settings.json` (check the `pluginConfigs` key for an installed `gpt@gpt-subagents`), costs, visibility, and limits. Point the settings table's row at it. Verify: the steps work as written in a new session. (Checked with `--settings` carrying `pluginConfigs` in a CLI session; the id-keyed form follows the engine's `<plugin>@<marketplace>` key.)

## 4. Check

- [x] 4.1 Live in `cached` and in `live`: dispatch `gpt:sol` to find and read a release announcement. Verify: the listing shows the web tools, `cached` sends `external_web_access: false` (checked in OpenAI's record), both reports arrive, and there's no Anthropic usage. Record whether cache-only reached the page. (2026-10-22, CLI 2.1.304: the cached session lists `gpt:sol` with `(Tools: Read, Edit, Write, Bash, WebSearch, WebFetch)` and the cache-only description. Both reports arrived with 0 Anthropic usage. The bridge sends `external_web_access: false` and OpenAI accepts it, though OpenAI's stored record doesn't echo the field. Cache-only reached the release announcement but not the GitHub releases page, which GPT cited without opening.)
