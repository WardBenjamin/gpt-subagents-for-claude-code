# Design

## Context

- **OpenAI's record.** A Responses API output holds one `web_search_call` item per web action. Its `action.type` is `search` (with `query` and `queries`), `open_page` (with `url`) or `find_in_page` (with `url` and a pattern). With `include: ["web_search_call.action.sources"]`, a `search` action also lists every URL it consulted. Inline `url_citation` annotations name only the most relevant of those.
- **Billing**, per OpenAI's web search guide: "Search actions incur a tool call cost." The rate is $10 per 1,000 calls, and the content a search or page returns is billed as input tokens.
- **Today.** The bridge returns `webActions` (`type`, `query?`, `url?`) for each step. The hook writes them as `[web]` lines in the step's transcript text, and the bridge appends a `Sources:` list built from the citations. Neither survives into a `SubagentHandback` message, and nothing records the actions across steps.

## Decisions

- **The plugin writes the list, not GPT.** It's built from OpenAI's output items, so it holds even when GPT's prose overstates. It goes at the end of the report message in both forms (the hand-back and the final text), under a fixed heading:

  ```
  Web activity (at OpenAI):
  - searched "nodejs 26 release"
  - opened https://nodejs.org/en/blog/release
  - cited, not opened: https://github.com/nodejs/node/releases (in search results)
  ```

  A cited URL counts as "in search results" when any search in the run listed it among its sources. Otherwise it's marked "not seen".
- **Run-wide, not per step.** `GptRun` keeps a deduplicated list of the run's web actions and the sources consulted, capped at 50 entries; past the cap, the report says how many were left out. The `[web]` lines in each step's transcript text stay as they are.
- **The GPT rule** goes in the instructions only when web access is on: "Say you opened a page only if you opened it. For a fact you saw only in search results, say so."
- **Pricing** uses OpenAI's own count, `tool_usage.web_search.num_requests`, and otherwise counts `search` actions.
- **Sources on reads.** In background mode the create returns before any search runs, so `include` on the create alone returns nothing. Every `GET /responses/{id}` also carries `include[]=web_search_call.action.sources`. A response without web actions reads the same with it.

## Risks / Trade-offs

- [Sources make each response larger] → They're URLs, not page content. They aren't sent back to GPT, and the bridge's paging already covers large turns.
- [OpenAI's billing rules can change] → The guide was checked on 2026-10-22, and the rate stays one constant in `responses.ts`.
