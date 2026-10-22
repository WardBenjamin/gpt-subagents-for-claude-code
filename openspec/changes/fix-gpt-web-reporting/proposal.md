# Proposal

## Why

A live check on 2026-10-22 (`gpt:sol`, web on) returned a correct, cited answer, but it was misleading in three ways:
- **It claimed visits it didn't make.** The report said GPT "opened" a release announcement and a GitHub releases page. OpenAI's record of the response shows one search and one page opened, the index page. The other two pages were cited from that page and from search results.
- **Claude can't check.** Each web action is written to the subagent's transcript as a `[web]` line. In auto mode, though, the report reaches Claude as a `SubagentHandback` message, which leaves those lines out. Claude sees citations, but not what GPT actually read.
- **The cost estimate is too high.** The bridge charges $0.01 for every `web_search_call`. OpenAI bills only `search` actions; `open_page` and `find_in_page` cost nothing beyond the tokens they add.

## What Changes

- **Web activity in every report.** When a run used the web, the report Claude receives ends with a "Web activity" list, built by the plugin from OpenAI's record rather than from GPT's text. The list covers every search and every page opened or searched across the whole run. It also lists cited pages that GPT didn't open, each marked as seen in search results or not.
- **Search sources recorded.** The bridge asks OpenAI for `web_search_call.action.sources` on the create and on every read of the stored response. A background response returns sources only when the read asks for them. The bridge returns the URLs each search consulted, and the URLs GPT's text cites. That's how a cited page can be marked as found in search results.
- **A rule for GPT.** With web access on, GPT is told to say "opened" only for pages it opened, and to label facts it took from search results.
- **Searches priced, not page visits.** `costUsd` adds $0.01 per search, as OpenAI counts them in `tool_usage.web_search.num_requests`, falling back to one per `search` action. Recorded responses confirm it: 0 requests for a turn that only opened a page, and 1 for a search plus two page actions.

**Out of scope:**
- New web modes, domain filters, and naming the tools for Claude (`add-gpt-web-modes`).
- Checking that GPT's claims are true. The plugin reports what GPT did, not whether what it says is correct.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-bridge`: web actions carry their sources, and only searches are priced.
- `gpt-agents`: the report lists the run's web activity, and GPT is told how to describe it.

## Impact

- `src/bridge/responses.ts`: `include` in the request, `sources` on each web action, pricing.
- `src/hooks/step.ts` and `register.ts`: keep the run's web actions in `GptRun`, add the activity list to the report in both report forms, and add the GPT rule.
- `src/types/index.d.ts`: `GptRun` gains the run's web actions.
- Fixtures and tests: a recorded response with search, `open_page` and `find_in_page` actions, and their sources.
