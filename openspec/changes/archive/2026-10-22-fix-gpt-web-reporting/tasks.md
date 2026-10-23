# Tasks

## 1. Bridge

- [x] 1.1 Request `include: ["web_search_call.action.sources"]` whenever the turn carries `web_search`, and on every read of a stored response. Return each action's `sources` (URLs) on `webActions` and the cited URLs as `citations`. Verify: a recorded live response with search, `open_page` and `find_in_page` actions parses with sources on the search.
- [x] 1.2 Price searches at $0.01 by OpenAI's `tool_usage.web_search.num_requests`, else per `search` action. Verify: a turn with one search and two page actions costs its tokens plus $0.01.

## 2. Report

- [x] 2.1 Keep the run's web actions and sources in `GptRun` (deduplicated, capped at 50), and append the "Web activity (at OpenAI):" list to the report in both forms, with cited-but-not-opened URLs marked. Verify: mod tests for the hand-back and final-text forms, a run whose searches span steps, a citation that appears in search sources, one that doesn't, and a run with no web actions (no list).
- [x] 2.2 Add the GPT rule to the instructions when web access is on. Verify: a mod test checks that the rule is present with web on and absent with web off.

## 3. Check

- [x] 3.1 Re-run the 2026-10-22 live check: `gpt:sol`, effort low, web on, asked for the newest Node.js 26.x announcement and the matching GitHub release. Verify: the report Claude receives ends with a web-activity list that matches OpenAI's record of the response, the step's estimate counts only searches, and the transcript shows no Anthropic usage. (2026-10-22, CLI 2.1.304, the branch's plugin. In live and cached runs the list matched OpenAI's record of the final response: searches, pages opened, and cited pages marked "not seen" exactly where no search listed them. OpenAI billed 1 search each, and the transcripts show 0 Anthropic usage. In the cached run, Claude used the list to flag two claims GPT made about pages it never opened.)
