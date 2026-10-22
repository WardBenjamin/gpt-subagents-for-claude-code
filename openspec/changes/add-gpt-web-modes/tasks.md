# Tasks

## 1. Setting and requests

- [ ] 1.1 Make `web` a string option (`off`, `cached`, `live`; default `off`) in `plugin.json`, read stored `true` as `live` and `false` as `off`, and send `{ type: "web_search", external_web_access: false }` in `cached` mode. Verify: mod tests for each value, including `true`, `false` and an unknown value.

## 2. Listing and guard

- [ ] 2.1 With web on, register the `gpt:*` types with `WebSearch` and `WebFetch` after `Read`, `Edit`, `Write` and `Bash`, and a description in the proposal's terms that names the mode. Verify: a mod test checks the registered tools and description per mode, and a new CLI session lists the types with those tools.
- [ ] 2.2 Refuse `WebSearch` and `WebFetch` tool calls from `gpt:*` agents in the `tool.call` hook. Verify: a mod test sends a fake call from a `gpt:*` agent and gets the refusal, while Claude's own `WebSearch` passes through.
- [ ] 2.3 Add the web instruction to GPT's instructions in `cached` and `live` modes. Verify: a mod test.

## 3. README

- [ ] 3.1 Write the "Web access" section: the modes with their OpenAI settings, the mapping to `WebSearch` and `WebFetch`, how to switch in `/config` and in `settings.json` (check the `pluginConfigs` key for an installed `gpt@gpt-subagents`), costs, visibility, and limits. Point the settings table's row at it. Verify: the steps work as written in a new session.

## 4. Check

- [ ] 4.1 Live in `cached` and in `live`: dispatch `gpt:sol` to find and read a release announcement. Verify: the listing shows the web tools, `cached` sends `external_web_access: false` (checked in OpenAI's record), both reports arrive, and there's no Anthropic usage. Record whether cache-only reached the page.
