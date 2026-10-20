# Proposal

## Why

`gpt:sol` works end to end as a native Claude Code subagent. Using it day to day still has gaps:
- only one model is offered;
- the caps and default effort are hard-coded;
- GPT has no way to search or read the web;
- nothing shows what GPT runs cost, in this session or over time.

## What Changes

- **Two more agent types.** `gpt:astra` (`gpt-6-astra`, the strongest and priciest) and `gpt:luna` (`gpt-6-luna`, the cheapest), next to `gpt:sol`. Each type's steps go to its own model.
- **Pricing for all three models** in the bridge, including cache writes, the long-prompt surcharge and web search calls ($10 per 1,000), so every run's cost is known and the cost cap applies to every type.
- **Settings** (`userConfig`, shown in `/config`):
  - an effort override (`inherit` by default), the step cap and the dollar cap;
  - a switch that gives GPT web access.

  Changing a setting reloads the mod with the new values.
- **Web access through OpenAI's own tooling.** When the switch is on, GPT gets OpenAI's hosted `web_search` tool (search, open page, find in page), run at OpenAI under OpenAI's site access and safeguards. GPT agents should match what GPT can reach on OpenAI's platform and carry OpenAI's security, so Claude Code's `WebFetch` and `WebSearch` aren't used: they would also make Anthropic requests of their own. Each web action GPT takes is written into the subagent's transcript, so Claude and the user can see what it searched and opened.
- **Cost ledger.** GPT spend is recorded per month and model, in plugin storage that lasts across sessions.
- **`/gpt` command:**
  - `/gpt status` lists this session's GPT runs: type, state, steps and cost.
  - `/gpt cost` shows the ledger.

**Out of scope:**

- A run pane or other drawn UI.
- A cancel command (stopping the subagent already cancels its response).
- MCP tools for GPT, and image input.
- Linux key storage (`add-linux-keyring`).
- Packaging and marketplace release (Phase 4).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-agents`:
  - adds `gpt:astra` and `gpt:luna`, and routes each type to its model;
  - makes the caps settings;
  - adds the web-access setting (OpenAI's hosted `web_search`), the cost ledger and `/gpt`.
- `gpt-bridge`: prices `gpt-6-astra` and `gpt-6-luna` as well as `gpt-6.1-sol`, including cache writes, the long-prompt surcharge on cached input, and web search calls. It also reports the web actions in each turn.

## Impact

- **Code:**
  - `src/.claude-plugin/plugin.json` (`userConfig`);
  - `src/hooks/register.ts`, `src/hooks/manifest.ts` and a new `src/hooks/gpt-command.ts`;
  - `src/types/index.d.ts` (the run record keeps its model);
  - `src/bridge/responses.ts` (prices);
  - tests for each.
- **Cost:** `gpt:astra` costs 5× `gpt:sol`, so the default $5 cap ends an astra run sooner. With web access on, each search action costs $0.01 at OpenAI, plus the retrieved content at the model's rates. No Anthropic usage is added.
- **Security:** GPT's web reads happen at OpenAI, outside Claude Code's permission system, under OpenAI's access rules. Their content reaches GPT, not Claude directly. GPT's instructions already treat tool output as data, and Claude receives GPT's report framed as a subagent report.
