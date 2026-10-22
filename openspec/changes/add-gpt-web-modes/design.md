# Design

## Context

- **Claude's tools.** In Claude Code 2.1.304, `WebSearch` takes `query`, `allowed_domains`, `blocked_domains` and `mode` (`standard` or `extended`). `WebFetch` takes `url`, `prompt` and `offset`; it refuses localhost and dotless hostnames, and it runs Anthropic models. The Agent tool takes `description`, `prompt`, `subagent_type`, `model`, `effort`, `run_in_background`, `name` and `isolation`, so there is no per-call tool list.
- **OpenAI's `web_search`**, per the guide checked on 2026-10-22, has these options:
  - `filters.allowed_domains` and `filters.blocked_domains`, up to 100 each;
  - `user_location`;
  - `search_context_size` (`low`, `medium` or `high`);
  - `external_web_access` (default `true`; `false` is cache-only);
  - `return_token_budget`.

  Its actions are `search`, `open_page` and `find_in_page`. No option turns off page opening.
- **The listing.** `$.agent.register({ tools })` sets the "(Tools: …)" line Claude reads when choosing a subagent. GPT's own functions come from the mod's manifest, not from that list.

## Decisions

- **Name OpenAI's tool after Claude's two.** `search` is `WebSearch`'s job, and `open_page` plus `find_in_page` are `WebFetch`'s. Since one OpenAI tool does both, web-on lists both names. Claude then prompts GPT the way it prompts any agent with those tools ("search for…", "read <url>…"), and nothing new has to be learned.
- **Modes are about freshness, not tools.** There's no honest way to offer search without fetch, so the modes are `off`, `cached` (`external_web_access: false`) and `live`. `cached` suits work that should never fetch a live page, such as a page that changes or one that might carry a prompt injection aimed at the run.
- **Listed but never run.** Putting `WebSearch` and `WebFetch` in the type's tools lets the engine accept those names from the agent. GPT can't emit them, because they aren't in its function manifest. As a second guarantee, the mod's `tool.call` hook refuses both for `gpt:*` agents, with a reason saying GPT's web runs at OpenAI.
- **Compatibility.** `options.web === true` reads as `live` and `false` as `off`. Any other unknown value reads as `off`.
- **README placement.** One "Web access" section replaces the current paragraph, linked from the settings table.

## Risks / Trade-offs

- [Claude may expect `WebFetch`'s `prompt` and `offset` behavior] → The description says both are OpenAI's web tool, used through the task prompt rather than called with arguments.
- [Listing a tool name the engine knows could let the engine run it] → The manifest leaves it out and the `tool.call` refusal backs that up. A test dispatches a fake `WebSearch` call from a `gpt:*` agent and expects the refusal.
- [In `cached` mode some pages are missing] → The description and README say so, and GPT reports what it couldn't reach.
