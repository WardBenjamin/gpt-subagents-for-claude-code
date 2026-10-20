# Tasks

## 1. Bridge

- [x] 1.1 In `src/bridge/responses.ts`, add astra and luna to `PRICES`, price cache writes, apply the long-prompt multiplier to every input rate, collect `web_search_call` items as `webActions` at $0.01 each, and append cited URLs as `Sources:`. Verify: `npm test --prefix src` covers each model's price, cache writes, the 272K surcharge, two web searches costing $0.02, and a `Sources:` list from `url_citation` annotations.

## 2. Types and settings

- [x] 2.1 Add `userConfig` (`effort`, `maxSteps`, `maxUsd`, `web`) to `src/.claude-plugin/plugin.json`, register `gpt:astra` and `gpt:luna`, and route each type to its model in the `turn.step` hook. Effort and caps come from `options`. Verify: `claude plugin validate src` passes, and `claude plugin test src` shows luna steps going to `gpt-6-luna` at the configured effort, and a $1 `maxUsd` stopping a run.

## 3. Web access

- [x] 3.1 When `options.web` is on, add `{ type: 'web_search' }` to the `turn` tools, and prefix each step's text with its `[web]` action lines. Verify: `claude plugin test src` shows the tool sent only when web is on, and the `[web] searched "…"` line in the step's text.

## 4. Ledger and /gpt

- [x] 4.1 Add the `$.store` `ledger` update per GPT step. Verify: a test capturing `store.set` shows the month and model entry growing by the step's cost, with one run on the first step.
- [x] 4.2 Write `src/hooks/gpt-command.ts` and register `/gpt` (`status`, `cost`, usage). Verify: `claude plugin test src` drives `$.command.run({ command: 'gpt', args: 'status' })` and `cost`, and checks the text.
- [x] 4.3 Update `src/README.md`: the three types and their prices, the settings, web access under OpenAI's tooling (off by default, outside Claude Code's permissions, listed in the transcript), and `/gpt`. Verify: the README's examples work as written in the gate.

## 5. Desktop gate (fresh session, acceptEdits)

- [x] 5.1 Dispatch `gpt:luna` and `gpt:astra` at `low` on a one-line question each. Verify: each answers, the bridge log shows the right model, and `/gpt status` and `/gpt cost` list both with nonzero cost.
- [x] 5.2 Turn web access on in `/config`, then dispatch `gpt:sol` to summarize the Reddit thread `https://www.reddit.com/r/ClaudeAI/comments/1vzl6kk/anthropic_published_an_ainative_sdlc_playbook_the/`. Verify: its transcript shows `[web]` lines, its report cites the page under `Sources:`, and no Anthropic usage is recorded for its steps. Record whether OpenAI could reach the page.
- [x] 5.3 Set `maxUsd` to 0.01 and dispatch `gpt:astra` on a multi-step task. Verify: the run stops with the cost-cap report.

## Workflow follow-up

- Archive after the gate. Phase 4: packaging, marketplace, release.
