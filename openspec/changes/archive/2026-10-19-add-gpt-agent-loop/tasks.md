# Tasks

## 1. Probes (Desktop, auto mode)

- [x] 1.1 From the mod, run `$.tool.call` for `Read`, `Edit`, a writing `Bash` and a read-only `Bash("rg -n …")` in `scratchpad/`. Verify: each outcome is in design.md.
- [x] 1.2 From the mod, `$.mcp.call` the plugin's server and log `next.origin` in a `tool.call` hook. Verify: design.md records the origin.
- [x] 1.3 Capture a real `SendMessage` result and test hook-built ones. Verify: design.md records the shapes.
- [x] 1.4 Prototype `turn.step` substitution: a real `gpt:sol` subagent with canned `Read`, `Edit` and `SubagentHandback` steps, then a `SendMessage` resume. Verify: design.md records the cost, the permission outcomes, the hand-back and the resume.

## 2. Manifest

- [x] 2.1 Write `src/hooks/manifest.ts`: function schemas for `Read`, `Edit`, `Write` and `Bash`, plus an argument filter. Change `npm test` to `node --test "bridge/**/*.spec.ts"` (the bridge's Node tests are renamed `*.spec.ts`, because `claude plugin test` runs every `*.test.ts`). Verify: `claude plugin test src` shows the filter dropping `run_in_background`, `dangerouslyDisableSandbox` and unknown keys, and `npm test --prefix src` still passes.

## 3. Step translation

- [x] 3.1 Write `src/hooks/step.ts`: new transcript messages to Responses API input (prompt text, `function_call_output` by `call_id`, resume text), and a bridge turn to `turn.step` chunks (`toolu_<call_id>` ids, filtered arguments, mapped usage, a hand-back when there are no calls). Verify: `claude plugin test src` covers first step, tool results, resume, the no-calls hand-back, and the step after a hand-back.

## 4. Hooks

- [x] 4.1 Write `src/hooks/register.ts` and `src/types/index.d.ts`: register `gpt:sol`, the `turn.step` hook (detect `gpt:*` steps, run state in `$.state`, `turn`/`wait` with `wait_ms` 20 000, caps, failure hand-back, abort with `cancel`), and the bridge guard. Verify: `claude plugin test src` shows that non-GPT steps pass through untouched, a GPT step never calls `next`, a bridge error becomes a hand-back, the 60-step cap reports, and Claude's direct `turn` is denied. (A test can't raise an abort, so `cancel` on interrupt is verified in 5.4.)
- [x] 4.2 Update `src/README.md`: dispatching `gpt:sol`, the permission behavior per mode (auto mode can't edit), the caps, and resume. Verify: the README's example works as written in 5.1.
- [x] 4.3 **Must fix (gate 2026-10-19, 5.4):** stopping a `gpt:sol` run must cancel its OpenAI response before the plugin's side stops. The engine aborts the in-flight `turn` or `wait` call itself, so `runTurn` throws before its `signal.aborted` check and never sends `cancel`, and the response runs on at OpenAI. Fix both sides:
  - in the hook, send `cancel` whenever a bridge call ends after the signal aborted, including when it throws;
  - in the bridge, when MCP cancels a `turn` or `wait` request (`notifications/cancelled`), call OpenAI's cancel for that response. This also covers a stop during the first `turn`, before the hook has the response id.

  Verify: `npm test --prefix src` covers the bridge cancelling on request cancellation, a re-run of 5.4 shows the response `cancelled` at OpenAI (a mod test can't raise an abort; see 4.1).
- [x] 4.4 **Must fix (gate 2026-10-19, 5.1 and 5.3):** hand back in the form the engine offers. In acceptEdits (and presumably default mode) the engine offers no `SubagentHandback` and takes the subagent's final assistant text as its report. Only in auto mode does it add the tool, with the reminder "Your final report is delivered through SubagentHandback". The mod always yields `SubagentHandback`, so outside auto mode the call is answered "No such tool available" and the caller gets "returned no output". This covers GPT's answer, the cap notes and the "GPT run failed" notes. Fix in `step.ts` and `register.ts`: yield `SubagentHandback` only when the step offers it, from the step's tool list if `turn.step` exposes one or else from that reminder in the transcript. Otherwise yield the report as plain text with `end_turn`.

  Verify: `claude plugin test src` covers both forms, and re-runs of 5.1 and 5.3 in acceptEdits deliver the report, with 5.2 still delivered in auto mode.

- [x] 4.5 (From gate 5.1.) Report `usage: null` on GPT steps, so the engine doesn't record GPT's tokens as the subagent's Claude tokens. Verify: `claude plugin test src` shows null usage on GPT steps.

## 5. Desktop gate

- [x] 5.1 (Gate 2026-10-19: failed; re-gate 2026-10-19 passed, see design.md "Re-gate result".) In a new Desktop session in `acceptEdits` mode, ask Claude to dispatch a `gpt:sol` agent at `low` effort to read `scratchpad/gate/input.txt` and write a one-line summary to `scratchpad/gate/summary.txt`. Verify: the file holds GPT's summary, the report reaches Claude, `subagent_tokens` is 0, and the bridge shows the turns.
- [x] 5.2 In auto mode, repeat 5.1. Verify: `Write` is refused, GPT reports the refusal without working around it, and the file is absent.
- [x] 5.3 `SendMessage` the 5.1 subagent a question that needs the file's second line. Verify: the answer is right, the request carried `previous_response_id`, and no `Read` ran. (First gate: its answer reached the caller only in the transcript. Re-gate: delivered.)
- [x] 5.4 (Gate 2026-10-19: failed; re-gate 2026-10-19 passed, see design.md "Re-gate result".) Stop a running `gpt:sol` subagent, and have Claude call `mcp__plugin_gpt_bridge__turn` directly. Verify: the response reports `cancelled`, and the direct call is denied.

## Workflow follow-up

- Archive after the gate. Draft the Anthropic feature request: auto-mode verdicts for plugin-answered steps.
- Propose Phase 3 (`/gpt` UX, `userConfig`, the cost ledger, `gpt:astra` and `gpt:luna`).
