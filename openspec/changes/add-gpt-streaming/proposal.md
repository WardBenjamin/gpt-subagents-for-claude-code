# Proposal

Notes for a possible change, written 2026-10-20. Nothing here is built or scheduled.

## Why

A Claude subagent's step streams: the engine shows text as it arrives and assembles tool calls from argument pieces. A GPT step does not. The bridge long-polls a background response and hands the whole turn back as one MCP tool result when it finishes. That has two costs.

- **Size.** Claude Code caps an MCP tool result at `MAX_MCP_OUTPUT_TOKENS` (25K tokens by default) and replaces a larger one with a note that is not an error. The cap protects the model's context from tool output, but here it lands on the model's own output. On 2026-10-20, a `gpt:sol` run lost its last step this way: one Write with 67K characters of content, about $0.20 of output. The fix that shipped pages a finished turn over 90% of the cap, in UTF-8 bytes, through the stateless `result` tool. That works, but it is a workaround for using a tool-result channel to carry a model stream.
- **Silence.** That step generated for six minutes with nothing visible. A Claude step of the same length would have shown its text, and the start of its tool call, as it went.

## What Changes

A possible design, to check against the live API before anything is built:

- **OpenAI side.** Background responses can be streamed, and a dropped stream can be resumed from an event's `sequence_number` with `GET /v1/responses/{id}?stream=true&starting_after=N`. The bridge would read the Server-Sent Events of a response instead of polling its status.
- **`wait` returns events, not the turn.** `wait { id, after?, wait_ms }` opens the stream after the cursor `after`. It returns `{ id, status, events, next }`: the normalized events since `after`, with `next` as the cursor for the following call. It returns early when `wait_ms` runs out, or when the events reach a character budget kept well under the MCP cap. Every reply is small by construction, so a long turn no longer needs a special path.
- **Stateless, like `result`.** Each `wait` opens its own stream from the cursor and closes it before returning. The bridge holds no connection or buffer between calls. Each `wait` still counts as a poll for the watchdog that cancels turns nobody polls. Interrupting stays as it is: `wait_ms` bounds how long an interrupt takes to land, and `cancel` ends the response.
- **Normalized events.** Text delta, function call started (`call_id`, `name`), function call arguments delta, function call done, web action, and finished (status, usage, cost, reason). The bridge maps OpenAI's event types to these, so the hook never sees OpenAI's shapes. This matches how `toTurn` normalizes a finished response today.
- **Hook streams chunks.** `runTurn` becomes an async generator that `turn.step` drains. A text delta yields a `text` chunk. A call that starts yields a `tool` chunk. Its arguments yield `input` chunks: the engine's `TurnStepInputChunk` is the same idea as OpenAI's arguments delta, and the engine joins and parses the pieces when the block ends.
- **Argument filtering.** `step.ts` drops `run_in_background`, `dangerouslyDisableSandbox` and unknown keys from GPT's arguments, which needs the whole object. One option is to stream text live, but hold each call's arguments until that call is done and emit them as one filtered `input` chunk. Each piece is still under the cap, because the bridge's event budget splits a long argument across `wait` replies, and the hook joins them before filtering. Streaming raw argument pieces needs the open question below answered first.
- **`result` stays.** It is still the way to read back a finished turn by id: to recover a lost step, or to debug. With streaming, the normal path no longer pages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gpt-bridge`: `wait` returns the events since a cursor instead of the turn, with a size budget per reply.
- `gpt-agents`: a GPT step streams its text and tool calls as chunks while the response is generated.

Delta specs wait until the open questions are answered.

## Impact

- `src/bridge/responses.ts`: an SSE reader on `fetch`'s body (split on blank lines, parse `data:`), the event normalization, and a streamed `wait` in place of `waitTurn`'s polling loop. The existing deadline and abort signals bound the stream the same way they bound a poll.
- `src/bridge/index.ts`: `wait`'s `after` argument, the budget, and the new reply shape. `wait`'s reply changes incompatibly, so the bridge and the hook must ship together, as they already do in one plugin version.
- `src/hooks/register.ts` and `src/hooks/step.ts`: `runTurn` as a generator, and step assembly from events instead of from a finished turn. The cost ledger and caps read usage from the finished event.
- Tests: a recorded live event stream as a fixture, replayed through the fake `fetch` as a streamed body.

## Open questions

- Must `stream: true` be set when the response is created, for a background response to be streamable later? If so, the create call returns a stream too. The bridge would read it until the response id arrives, close it, and resume by cursor.
- How long does OpenAI keep a response's events for `starting_after`? A turn that runs longer than that could not resume its stream. It would need to fall back to polling, then `result`.
- Do the engine's `input` chunks or the step's returned `toolUses` decide what a tool runs with? If the chunks decide, raw pieces can't be filtered, and arguments must be held until each call is done.
- How does the engine handle a step whose chunks arrive over many minutes (transcript writes, the UI, an interrupt mid-chunk)?
- Is live text worth the change for subagents that usually run in the background? Compare the cost against what a user sees in the subagent's transcript view.
