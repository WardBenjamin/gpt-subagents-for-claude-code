# Tasks

## 1. Bridge

- [ ] 1.1 When a terminal turn has a `web_search_call`, read it once more with `include[]=web_search_call.results` as well as sources. Return `pages` (result URLs) on each web action and `notices` on the turn, without page text. Verify: a trimmed fixture of the 47-page run gives 5 actions with 8, 8, 8, 10 and 13 pages; a fixture with a non-page result and a failed `web_search_call` gives notices; and polls don't ask for results.

## 2. Mod

- [ ] 2.1 Keep the run's pages and notices in `GptRunWeb`. The list shows each search with how many results it listed, each page action with its page count and pages, cited pages no action returned, and up to 5 notices, adding the `webBudget unlimited` hint when the budget is `default`. Verify: mod tests for a batch, a page cited after a batch opened it, notices with and without the hint, and the 50-line cap.
- [ ] 2.2 Add `webBudget` (`default` | `unlimited`) to `plugin.json`, and send `return_token_budget: "unlimited"` when it's `unlimited` and web access is on. Verify: mod tests; `/gpt settings` lists it.

## 3. Evidence and docs

- [ ] 3.1 Capture a budget refusal: from the user's run (its response id or subagent transcript), or a live run that exhausts the default budget with long pages. Record what the web tool returns, and narrow the notice rule if needed. Verify: a fixture of it gives one notice naming the budget.
- [ ] 3.2 README Web access: batches and page counts, notices, and `webBudget` with its cost and latency trade-off. Verify: the steps work as written.
- [ ] 3.3 Live: the 47-page task in a Desktop-style session through the plugin. Verify: the report's list says 47 pages opened across 5 actions, and no page is marked "cited, not opened".
