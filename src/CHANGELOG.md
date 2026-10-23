# Changelog

Versions follow [Semantic Versioning](https://semver.org/). Entries come from the repository's Conventional Commits: `feat` under Added, `fix` under Fixed, and breaking changes (`!`) under Changed.

## 0.5.0 – 2026-10-22

### Added

- **A GPT web budget setting** (`webBudget`: `default` or `unlimited`). OpenAI caps how much page content its web search returns to GPT in a run. `unlimited` removes that cap (`return_token_budget: "unlimited"`), which can make runs slower and cost more.
- **The web tool's notices**, such as a refusal, end the web-activity list. On the default budget, the list also suggests `/gpt settings webBudget unlimited`.

### Fixed

- **The web-activity list counts pages, not actions.** One `open_page` action can return a batch of pages: a 47-page run had 4 or 5 actions. The bridge now reads a finished web turn once more with `web_search_call.results`, and returns each action's page URLs, never the page text. The list shows each batch with its pages, each page listed once per run. A page opened in a batch is no longer marked "cited, not opened". Searches show how many results they listed.

## 0.4.0 – 2026-10-22

### Added

- **`/gpt settings`** lists the plugin's settings with the values the session runs on. `/gpt settings <name> <value>` changes one, for example `/gpt settings webCacheOnly on`, in any session, Desktop included. Desktop's settings screens don't show plugin options for a marketplace you added. Values are checked against the setting's type before anything is saved. The value is saved through the session's `/config` row where it has one, and otherwise through `claude plugin configure`. Claude Code then reloads the plugin, so the change applies from the session's next GPT step.

## 0.3.0 – 2026-10-22

### Added

- **Web modes.** A new **GPT web: cache only** setting, beside **GPT web access**, gives three modes. Off is the default. Live sends OpenAI's `web_search`. Cached sends it with `external_web_access: false`, which uses only OpenAI's cached pages.
- **Web tools named in Claude's terms.** With web on, the `gpt:*` types are listed with `WebSearch` and `WebFetch`, and their description names the mode, so Claude prompts them like any agent with web tools. Claude Code's own `WebSearch` and `WebFetch` are refused for a GPT agent, so they never run for one.
- **A web-activity list in every report.** A report from a run that used the web ends with a "Web activity (at OpenAI)" list, built from OpenAI's record of the run rather than from GPT's text. It holds each search and page opened or searched, plus each page GPT cited without opening, marked as found in search results or not seen. In auto mode, Claude used to see none of this. GPT is now told to say "opened" only for pages it opened.
- The bridge returns the URLs each search consulted, and the URLs GPT cites. It asks OpenAI for `web_search_call.action.sources` on the create and on every read.
- The README has a "Web access" section: modes, switching, what Claude sees, costs and limits.

### Fixed

- Web costs are no longer overstated. Only searches cost $0.01, counted as OpenAI counts them (`tool_usage.web_search.num_requests`). Opening a page or searching within it costs only its tokens; before, each was charged $0.01 too.

## 0.2.1 – 2026-10-20

### Fixed

- A GPT step whose result is longer than Claude Code's MCP output cap (`MAX_MCP_OUTPUT_TOKENS`, 25K tokens by default), such as one Write of a long report, no longer fails the run with `JSON Parse error: Unexpected identifier "Error"`. Claude Code swaps such a result for a note that is not an error, so a finished turn longer than one page now comes as `{ id, status, pages, length }`. A page is 90% of the cap in UTF-8 bytes, which fits whatever the script, because a token is at least one byte. If Claude Code still swaps or cuts a page (a cap set on its side, unseen by the bridge), the pages' joined length gives it away and the run fails, so no tool runs on corrupted arguments. The plugin reads each page with the bridge's new `result` tool, which reads the stored response from OpenAI again each time, so the bridge holds nothing between calls. **Add `mcp__plugin_gpt_bridge__result` to your allow rules** (see the README), or auto mode refuses it. Any other reply that is not JSON now fails the run with its first 200 characters, not a bare parse error.

## 0.2.0 – 2026-10-20

The first public release, a preview.

### Added

- Install from GitHub with no setup step: `claude plugin marketplace add WardBenjamin/gpt-subagents-for-claude-code`, then `claude plugin install gpt@gpt-subagents`. The marketplace was renamed from `gpt-agents`.
- On Linux, the bridge reads the key from the Secret Service (`secret-tool`, service `openai`), else from `$XDG_CONFIG_HOME/gpt/openai-key`, which it refuses unless only its owner can read it. The no-key error names the store and command for the platform.
- An MIT license.

### Changed

- The bridge has no runtime dependencies: it speaks MCP over stdio itself, so it runs from a plain clone without `npm install`, and the plugin folder has nothing for Claude Code to install (the test-only dev tooling moved to the repository root). It needs Node 24.2 or later (it said 23.6, but on 23.6–24.1 it exited without serving).

### Fixed

- The bridge strips the key, and any masked fragment of it, from everything it returns: transport and parse errors and failed turns too, not only non-2xx error messages.
- `wait_ms` and cancellation now bound every request, including a stalled connection or response body. A cancelled `turn` creates nothing, and a cancel during retry backoff cancels at OpenAI instead of retrying.
- A `turn` whose create may have reached OpenAI (a 5xx, a dropped connection, no answer in time) is reported as possibly started instead of being sent again: OpenAI offers no idempotency key, so a resend could start a second, unwatched response.
- A failed poll no longer drops a running turn from the watchdog, so a turn left unpolled after the failure is still cancelled at OpenAI.

## 0.1.0 – 2026-10-20

Development releases before 1.0.0, summarized.

### Added

- The bridge: a stdio MCP server (`turn`, `wait`, `cancel`, `health`) that runs GPT turns on the OpenAI Responses API in background mode, with long-polls, retries and cost estimates. It reads the key from the macOS Keychain item `openai`.
- The `gpt:sol` agent type: a native Claude Code subagent whose every model step GPT-6.1 Sol answers, through a `turn.step` hook that makes no Anthropic request. Claude Code runs its tool calls (`Read`, `Edit`, `Write`, `Bash`) under the session's permissions, and it supports hand-back reports and `SendMessage` follow-ups.
- The `gpt:astra` (`gpt-6-astra`) and `gpt:luna` (`gpt-6-luna`) agent types, priced per model, including cache writes and the surcharge past 272K prompt tokens.
- Settings in `/config`: GPT effort (`inherit` or `low`..`max`), the step cap, the cost cap, and web access.
- Web access through OpenAI's hosted `web_search`, run at OpenAI. Each action appears as a `[web]` line in the transcript, and cited pages are listed under `Sources:`.
- A cost ledger across sessions, with `/gpt status` and `/gpt cost`.

### Fixed

- 401 errors no longer pass on the key fragment that OpenAI echoes.
- The report uses the form the engine offers: `SubagentHandback` in auto mode, final text otherwise.
- Stopping a run cancels its OpenAI response.
- GPT's tokens are no longer reported as Claude usage.
- `/gpt status` lists finished runs, and `/gpt cost` includes this session's spend.
