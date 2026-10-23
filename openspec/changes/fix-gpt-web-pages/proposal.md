# Proposal

## Why

A user's `gpt:sol` research run stopped after 10–15 web actions. GPT said the web tool "refused more pages at a token limit", and that it had reviewed 36 pages. The plugin's activity list showed 13 actions, 6 of them pages opened. Checked on 2026-10-22:

- **One action opens many pages.** A `web_search_call` with `action.type: "open_page"` can return a batch: with `include: ["web_search_call.results"]`, its `results` hold one `text_result` per page, each with its `url`. Yet `action.url` names only one page. In a recorded `gpt-6.1-sol` run, 5 `open_page` actions returned 47 pages: 8, 8, 8, 10 and 13. The plugin counts actions, so its list undercounts pages. It can also mark a page "cited, not opened" when a batch did open it.
- **The returned-token budget is real.** OpenAI's web search guide says `return_token_budget` "controls how much web search result content the tool can return during a Responses API search run" for GPT-5+ reasoning models. It takes `"default"` or `"unlimited"`, and `"unlimited"` "can increase latency and cost". The guide gives no size, and doesn't say what the model sees when the budget runs out. The 47 short release-note pages fit the default budget, so `unlimited` made no difference there.
- **The "36 pages" figure** fits pages read in batches plus search results listed, neither of which the plugin's list counts.

## What Changes

- **Count pages, not actions.** Once a turn with web actions has finished, the bridge reads it once more with `web_search_call.results`. Each web action then carries `pages`, the URLs of the pages it returned. The page text is dropped in the bridge and never reaches Claude or the transcript.
- **Surface what the web tool said.** Anything else a web action returns, such as a budget refusal, comes back as a short notice (200 characters), and so does a `web_search_call` whose status isn't `completed`. The report's web-activity list ends with these notices. When web budget is `default`, it also suggests `/gpt settings webBudget unlimited`.
- **The web-activity list per action:**
  - each search, with how many results it listed;
  - each page action, with its pages, as in "opened 13 pages: …";
  - cited pages that no action returned, marked "in search results" or "not seen", as now.

  Each page is listed once across the run, capped at 100 lines with a count of the rest.
- **A `webBudget` setting**, `default` or `unlimited`. With `unlimited`, `web_search` carries `return_token_budget: "unlimited"`. `/gpt settings` shows it, since it reads the manifest.
- **Specs tidied:** the three requirements over the length limit are split. They're the bridge's "Report function calls and usage" and "Price each turn", and the agents' "Web access through OpenAI's tooling".

**Out of scope:**
- Changing how GPT searches, or telling it to search more.
- Passing page text to Claude.
- Raising the budget by default: `unlimited` costs more and may be slower.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-bridge`: web actions carry the pages they returned and the web tool's notices, with the long requirements split.
- `gpt-agents`: the activity list counts pages and shows the web tool's notices, and there's a `webBudget` setting.

## Impact

- `src/bridge/responses.ts`: the extra read of a finished web turn, and `pages` and `notices` in `toTurn`.
- `src/hooks/step.ts`: the activity list by action, with page counts and notices.
- `src/hooks/register.ts` and `plugin.json`: `webBudget`, and `return_token_budget` in the tool.
- `src/types/index.d.ts`: `GptRunWeb` keeps pages and notices.
- A trimmed fixture of the 47-page run, and tests.
- `README.md`: Web access covers batches, notices and `webBudget`.
