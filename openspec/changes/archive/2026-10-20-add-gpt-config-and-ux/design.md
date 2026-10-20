# Design

## Context

- **The plugin `gpt`** (`src/`) registers `gpt:sol`. Its `turn.step` hook answers every model step of a `gpt:*` subagent through the stdio MCP bridge, and never calls `next`. Run state is `$.state` `gpt.runs` (a StateFamily keyed by agent id). Caps are constants: 60 steps and $5. GPT's tools are `Read`, `Edit`, `Write` and `Bash`. GPT steps report `usage: null`.
- **Mod API (Claude Code 2.1.299):**
  - `register(on, options)` receives the manifest's `userConfig` values, with defaults filled in. Non-secret fields are rows in `/config`, and a `string` field with `options` is a picker there. A change reloads the module with the new `options`. Tests pass values with `test(name, { options }, body)`.
  - `$.store` (`get`, `set`, `delete`) persists JSON across sessions, 4 MiB in all.
  - `$.command.register({ name, description })` plus a `command.run` hook returning `{ text }` makes a slash command.
  - `$.agent.list()` gives each agent's `type` and `status`.
- **OpenAI** (model pages and pricing, read 2026-10-19), prices per million tokens:

  | Model | Input | Cached input | Cache writes | Output |
  | --- | --- | --- | --- | --- |
  | `gpt-6-astra` | $10 | $1 | $12.50 | $50 |
  | `gpt-6.1-sol` | $2 | $0.10 | $2.50 | $10 |
  | `gpt-6-luna` | $0.10 | $0.01 | not listed | $0.50 |

  - Over 272K input tokens, input and cache rates double and output is 1.5×. All three take effort `low`..`max` and tool calling on Responses.
  - Hosted web search is `{ "type": "web_search" }`. It adds `web_search_call` output items with `action.type` `search` (`query`), `open_page` (`url`) or `find_in_page`. Citations come as `url_citation` annotations (`url`, `title`), which OpenAI requires to be visibly shown.
  - Web search costs $10 per 1,000 calls, plus the retrieved content tokens at the model's rates. Those tokens are presumably in the response's input usage.
- **Why not Claude Code's web tools:** `WebFetch` summarizes the page with a small Claude model, and `WebSearch` runs inside an Anthropic request. GPT agents should also reach exactly what GPT can reach on OpenAI's platform, under OpenAI's safeguards (Ben's call, 2026-10-19).

**Live check (2026-10-19, before the gate).** One `low`-effort `gpt-6-luna` turn with `{ type: "web_search" }` went through the bridge client:
- OpenAI opened the Reddit thread (one `open_page` action) and GPT returned its title and summary with a `url_citation`.
- The bridge listed the action and appended `Sources:`.
- Usage included 4,488 cache-write tokens, so luna does bill cache writes (priced at the assumed input rate). The turn cost about $0.011.
- The response is now the fixture `src/bridge/fixtures/live-web-search.json`.

## Goals / Non-Goals

**Goals:** pick a GPT model by agent type, tune the caps and override effort without code, give GPT the web under OpenAI's security, and know what it costs.

**Non-Goals:**
- drawn UI;
- per-domain web filters (OpenAI's `filters.allowed_domains` is available later if needed);
- web image results;
- an Anthropic-side permission gate for GPT's web reads.

## Decisions

- **Types table.** `register.ts` holds `TYPES = { sol: 'gpt-6.1-sol', astra: 'gpt-6-astra', luna: 'gpt-6-luna' }`, each with a description, registered at `session.start`. The `turn.step` hook already reads the agent's type from `$.agent.list()`; it now looks up the model from that type, and caches the id-to-type mapping where it used to cache only the id.
- **`userConfig`** in `plugin.json`:
  - `effort`: a string, options `inherit` and `low`..`max`, default `inherit`. A step's `e.effort` is the Agent call's effort or else the session's, and `agent.spawn` doesn't say which, so the setting can't be a "default when the call names none". `inherit` passes the step's effort through, and a named level overrides it for every GPT step;
  - `maxSteps`: a number, default 60;
  - `maxUsd`: a number, default 5;
  - `web`: a boolean, default false.

  `register(on, options)` closes over them. A reload replaces the closure, and the run state in `$.state` survives the reload.
- **Web access.** When `options.web` is on, the `turn` arguments get `tools: [...MANIFEST, { type: 'web_search' }]`. The bridge passes `tools` through unchanged, so OpenAI runs the searches inside the turn. In a single long-polled turn, GPT can search several times before it answers or calls a function.
- **Bridge: web actions, citations, prices.**
  - `toTurn` collects `web_search_call` items as `webActions: [{ type, query?, url? }]`, adds $0.01 per item to `costUsd`, and appends `Sources:` with `- [title](url)` per distinct `url_citation`.
  - `PRICES` gains astra and luna, and cache writes (`input_tokens_details.cache_write_tokens`).
  - The long-prompt multiplier now applies to cached and cache-write rates too. That settles the earlier note in the code.
  - Luna lists no cache-write rate, so its input rate is used (an assumption, marked in the code).
- **Web actions in the transcript.** `stepFromTurn` prefixes the step's text with one line per web action, such as `[web] searched "…"` or `[web] opened https://…`. That gives Claude and the user an audit trail in the subagent's transcript, even though the searches ran at OpenAI.
- **Ledger.** `$.store` key `ledger` holds `{ [YYYY-MM]: { [model]: { usd, runs, steps } } }`, with the month taken in UTC from `$.clock.now()`. Each GPT step adds its cost and one step, and a run's first step adds one run. It's a read-modify-write per step. Concurrent runs can race, but at worst lose a cent in the record; OpenAI's dashboard remains the source of truth.
- **`/gpt`.** Registered at `session.start`, and answered by a `command.run` hook:
  - `status` lists this session's GPT runs from `$.state` `gpt.session` (agent id to type and description, written at a run's first step), with each run's steps and `costUsd`, and the agent's status while `$.agent.list()` still lists it, else `done`. `$.agent.list()` alone loses a run once the engine drops its task (gate, 2026-10-20);
  - `cost` shows this session's spend per model, then the ledger's current month and all-time totals per model;
  - anything else shows the usage line.

  This lives in `gpt-command.ts`, as pure formatting functions with tests.

## Risks / Trade-offs

- [GPT's web reads skip Claude Code's permission system] → This is deliberate: OpenAI's access and safeguards apply. The setting is off by default and the README says so. Every action is listed in the transcript.
- [The hosted search's retrieved content can carry prompt injection] → GPT's instructions treat all tool output as data. Claude gets GPT's report as a subagent report, not instructions.
- [Prices change] → They're in one table in `responses.ts`, dated in this design. `/gpt cost` is an estimate; OpenAI's dashboard is the truth.
- [`gpt:astra` at the default $5 cap stops after about 100K output tokens] → That's acceptable, and the setting raises it.

## Gate result (2026-10-20)

Desktop Code tab, Claude Code 2.1.299 engine (the shell's `claude` is 2.1.304). The plugin was linked into the session's dev-mods folder with hot reloading on, in acceptEdits mode. `health` reported `key: found`, `model: available`, and `gpt:sol`, `gpt:astra` and `gpt:luna` were all listed.

- **5.1: partial at first, passed on re-run after the fix below.**
  - Luna answered "Au" and astra answered "The capital of Australia is Canberra.", each at `low` with `subagent_tokens: 0`.
  - Model evidence comes from the `$.store` ledger only: it recorded one run each for `gpt-6-luna` ($0.0000446) and `gpt-6-astra` ($0.00475). The bridge's MCP log records `turn` calls but no model. The subagent transcripts label each step `claude-opus-5-5` (the session's model) with zero usage.
  - `/gpt cost` worked:
    ```
    gpt: This month (2026-10): $0.0048
      gpt-6-luna  $0.0000  1 runs  1 steps
      gpt-6-astra  $0.0047  1 runs  1 steps
    All time: $0.0048 (same rows)
    ```
    Luna's nonzero cost is shown as `$0.0000` because of 4-decimal rounding.
  - **Failed:** `/gpt status`, run right after both runs, printed `gpt: No GPT runs in this session.` It builds its rows from `$.agent.list()`, which drops a subagent once the engine drops its task, and finished foreground runs drop quickly. A session-scoped list needs its own record, for example the `$.state` runs.
  - Ben asked for this session's spend in `/gpt cost` too.
  - **Fix and re-run (same day).** `/gpt status` and `/gpt cost` now read the session's own record (`gpt.session`), `/gpt cost` leads with "This session", and amounts under $0.0001 show as `<$0.0001`. After the mod reloaded, luna and astra were dispatched again at `low`. Both answered with `subagent_tokens: 0`. The session was in auto mode by then, so the reports came through `SubagentHandback`. Runs from before the reload aren't in the session record. The output:
    ```
    gpt:luna  af1aae37  done  1 steps  <$0.0001  luna one-line question (re-run)
    gpt:astra  a24eb93b  done  1 steps  $0.0050  astra one-line question (re-run)
    Total: $0.0050

    This session: $0.0050
      gpt-6-luna  <$0.0001  1 runs  1 steps
      gpt-6-astra  $0.0050  1 runs  1 steps
    This month (2026-10): $0.12
      gpt-6-luna  <$0.0001  2 runs  2 steps
      gpt-6-astra  $0.07  3 runs  3 steps
      gpt-6.1-sol  $0.04  1 runs  1 steps
    ```
- **5.2: passed.**
  - The desktop app has no `/config` rows for a dev-mods plugin. With Ben's yes, `pluginConfigs.gpt.options.web: true` went into `~/.claude/settings.json`, and it applied from the next GPT step, with no restart.
  - `gpt:sol` at `low` summarized the Reddit thread. OpenAI reached the page.
  - The transcript's step text starts with `[web] opened https://www.reddit.com/r/ClaudeAI/comments/1vzl6kk/…`. The report cites the thread inline and lists it under `Sources:`.
  - `subagent_tokens: 0`, and the transcript usage is all zero. The run cost $0.042 (ledger).
- **5.3: passed.**
  - With `maxUsd: 0.01` set the same way, `gpt:astra` at `low` was asked to read three `src/hooks/` files and compare them. It made one GPT step, which called `Read`, and the run then ended with "GPT run stopped: the $0.01 cost cap was reached."
  - The cap is checked before each step, so the first step alone overshot it: $0.064, mostly first-turn prompt and cache writes. A run can exceed the cap by one step's cost.
  - Afterwards, `pluginConfigs` was removed again (defaults: cap $5, web off).
