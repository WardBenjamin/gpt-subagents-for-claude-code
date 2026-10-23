# Tasks

## 1. Bridge

- [x] 1.1 When a terminal turn has a `web_search_call`, read it once more with `include[]=web_search_call.results` as well as sources. Return `pages` (result URLs) on each web action and `notices` on the turn, without page text. Verify: a trimmed fixture of the 47-page run gives 5 actions with 8, 8, 8, 10 and 13 pages; a fixture with a non-page result and a failed `web_search_call` gives notices; and polls don't ask for results.

## 2. Mod

- [x] 2.1 Keep the run's pages and notices in `GptRunWeb`. The list shows each search with how many results it listed, each page action with its page count and pages, cited pages no action returned, and up to 5 notices, adding the `webBudget unlimited` hint when the budget is `default`. Verify: mod tests for a batch, a page cited after a batch opened it, notices with and without the hint, and the 100-line cap.
- [x] 2.2 Add `webBudget` (`default` | `unlimited`) to `plugin.json`, and send `return_token_budget: "unlimited"` when it's `unlimited` and web access is on. Verify: mod tests; `/gpt settings` lists it.

## 3. Evidence and docs

- [ ] 3.1 Capture a budget refusal: from the user's run (its response id or subagent transcript), or a live run that exhausts the default budget with long pages. Record what the web tool returns, and narrow the notice rule if needed. Verify: a fixture of it gives one notice naming the budget.
- [x] 3.2 README Web access: batches and page counts, notices, and `webBudget` with its cost and latency trade-off. Verify: the steps work as written.
- [x] 3.3 Live: the 47-page task in a Desktop-style session through the plugin. Verify: the report's list says 47 pages opened across 5 actions, and no page is marked "cited, not opened". (2026-10-22, CLI 2.1.304, the branch's plugin: the report listed 47 pages across 4 actions (12, 12, 12 and 11), with none marked "cited, not opened". The 50-line cap then in place cut the last page line, and Claude took the cut for a relay truncation, so the cap is now 100 lines with a note that says so.)
