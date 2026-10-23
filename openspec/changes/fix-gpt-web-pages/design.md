# Design

## Context

From a recorded run (`gpt-6.1-sol`, low effort, 47 Node.js release pages, 2026-10-22) and OpenAI's guide:
- **Results.** `GET /responses/{id}?include[]=web_search_call.results` adds `results` to each `web_search_call`. For a page action, each result is `{ type: "text_result", url, title, snippet }`. The `snippet` is the page text the model read, headed `[wordlim: 200] Crawled: …; Source: open({"ref_id": "<url>"})`.
- **Size.** That run's response came to 157 KB with results, against a few KB without. A turn still `in_progress` returns its partial output on every poll.
- **The budget.** `return_token_budget` takes only `"default"` or `"unlimited"`, and applies to the hosted `web_search` tool with GPT-5+ reasoning models. The guide doesn't give the default size or describe exhaustion. The user's run is the only sighting of exhaustion so far, and its wording comes from GPT, not from the tool.

## Decisions

- **One extra read, at the end.** Polls keep asking only for `web_search_call.action.sources`, which is small. When a turn is terminal and has a `web_search_call`, the bridge reads it once more with `web_search_call.results` too, and builds `pages` and `notices` from that. Asking on every poll would re-download page text each time.
- **Page text never leaves the bridge.** Only URLs and short notices are returned. That keeps MCP results small, and keeps page content out of Claude's context and the transcript, where it could carry a prompt injection.
- **Which results are notices.** Any result that isn't a `text_result` with a `url`, plus the status of a `web_search_call` that isn't `completed`. Notices are trimmed to 200 characters and redacted like errors. Until a refusal is captured, any non-page result counts as a notice; task 3.1 records the real one and narrows this.
- **Pages count once.** A page any action returned counts as opened for the whole run, so a page opened in a batch is never "cited, not opened".
- **The setting.** `webBudget` is a string option with `default` and `unlimited`, defaulting to `default`. It's a new key, so stored settings stay valid, and it does nothing while web access is off.

## Risks / Trade-offs

- [The end-of-turn read adds a request] → It happens only for turns with web actions. It's one GET of up to a few hundred KB, read once and discarded.
- [OpenAI changes the shape of `results`] → If `url` is missing, the bridge falls back to `action.url`, and a recorded fixture pins today's shape.
- [Notices are noisy] → They're capped at 5 per run in the report, with a count of the rest.
