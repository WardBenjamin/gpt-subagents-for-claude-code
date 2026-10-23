# Proposal

## Why

GPT's web access is a single on/off switch, and Claude can't see it in the terms it already uses:
- **Claude's own web tools** are `WebSearch` (`query`, `allowed_domains`, `blocked_domains`, `mode`) and `WebFetch` (`url`, `prompt`, `offset`). Claude chooses and prompts subagents by the tools in their listing line, for example "(Tools: Read, Edit, Write, Bash)". With web on, the `gpt:*` types still list only those four, so Claude can't tell GPT can search or read pages.
- **OpenAI's hosted `web_search`** is a single tool that both searches (`search`) and reads pages (`open_page`, `find_in_page`). No setting allows one without the other. It does have a cache-only mode (`external_web_access: false`) that never fetches live pages.
- **The README** describes the switch in one table row and one paragraph. It doesn't explain the modes, the costs, or how to change the setting outside `/config`.

## What Changes

- **Three web modes from two switches.** The existing `web` switch (off by default) gets a companion, `webCacheOnly`. Web off is `off`; web on is `live`, which sends `web_search` with OpenAI's defaults; web on plus cache-only is `cached`, which sends `external_web_access: false`. `web` stays a boolean because the engine rejects a stored setting that doesn't match its declared type, so a type change would stop the plugin loading for anyone who turned web on in 0.2.x.
- **Listed in Claude's own terms.** With web on, the `gpt:*` types list `WebSearch` and `WebFetch` after `Read`, `Edit`, `Write` and `Bash`. Their description says both run at OpenAI (cache-only in `cached` mode), outside Claude Code's permissions, never reach localhost or private URLs, and are used only when the task needs the web. It also says that a prompt saying "no web" keeps GPT off it.
- **Never Claude's tools.** GPT is still never offered Claude Code's `WebSearch` or `WebFetch`. The mod refuses either one if a `gpt:*` agent ever calls it, so a GPT run never starts an Anthropic web request.
- **GPT's instructions** say the web is available, in which mode, and to use it only when the task needs current or outside information, never when the task says not to.
- **README.** A "Web access" section covering:
  - the three modes, with the OpenAI setting each one sends;
  - how they map to Claude's `WebSearch` and `WebFetch`;
  - how to switch, in `/config` or in `settings.json` (`pluginConfigs`);
  - costs ($0.01 per search plus content tokens);
  - what Claude sees (`[web]` lines and the web-activity list);
  - limits: no per-dispatch switch, no fetch-only mode, no private URLs.

**Out of scope:**

- **A per-dispatch switch.** The Agent tool has no per-call tool list, and separate web types would double the listing. The setting is the ceiling, and the prompt is how a dispatch opts out. Revisit if instructions turn out not to be enough.
- **Domain filters.** OpenAI's `filters.allowed_domains` and `filters.blocked_domains` match `WebSearch`'s, but only a setting could carry them, since the Agent call can't. Add them later if a session-wide filter is wanted.
- **Search depth.** `WebSearch`'s `standard` and `extended` modes have no exact match in OpenAI's `search_context_size`.
- **Report accuracy and pricing** (`fix-gpt-web-reporting`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-agents`: three web modes, and web-capable types listed with `WebSearch` and `WebFetch`.

## Impact

- `src/.claude-plugin/plugin.json`: a `webCacheOnly` switch beside `web`, and `web`'s description in Claude's terms.
- `src/hooks/register.ts`: the mode from the two switches, the tool list and description, the per-mode `web_search` config, the GPT instruction, and the refusal of Claude's web tools for `gpt:*` agents.
- `README.md`: the "Web access" section.
- Tests for each mode, the listing, and the refusal.
