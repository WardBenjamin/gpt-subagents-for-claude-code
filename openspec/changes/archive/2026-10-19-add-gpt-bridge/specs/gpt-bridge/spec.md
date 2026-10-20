# Spec Delta

## Purpose

The `gpt` plugin's local MCP server (`bridge`): it runs GPT turns on the OpenAI Responses API for the plugin's mod, long-polls them within one MCP call's time, and reports each turn's text, function calls, usage and cost.

## ADDED Requirements

### Requirement: Start a turn
The `turn` tool SHALL create a stored, background Responses API response from `model`, `effort`, `instructions`, `input`, optional `previous_response_id`, `tools` and `max_output_tokens`. It SHALL then wait up to `wait_ms` (default 45 000) for that response to finish.

#### Scenario: Turn finishes within wait_ms
- **WHEN** `turn` is called and the response completes before `wait_ms`
- **THEN** it returns `{ id, status: "completed", text, calls, usage, costUsd }`

#### Scenario: Turn still running at wait_ms
- **WHEN** the response has not finished when `wait_ms` elapses
- **THEN** it returns `{ id, status: "in_progress" }` within `wait_ms` plus 5 s

### Requirement: Wait on a turn
The `wait` tool SHALL long-poll an existing response by `id`, up to `wait_ms`, and return the same shape as `turn`.

#### Scenario: Turn completes across several waits
- **WHEN** a response takes three minutes and the caller repeats `wait` with `wait_ms` of 45 000
- **THEN** each call returns within 50 s, and the first call after completion returns `status: "completed"` with the result

### Requirement: Report function calls and usage
A finished turn SHALL list each function call as `{ call_id, name, args }` (with `args` parsed from JSON), its output text joined as `text`, and token usage including cached input. `costUsd` SHALL be priced from that usage at the model's rates: for `gpt-6.1-sol`, $2.00/M input, $0.10/M cached input and $10.00/M output.

#### Scenario: Turn ends with function calls
- **WHEN** GPT answers with two function calls and no text
- **THEN** `calls` holds both, in order, with parsed `args`, and `text` is empty

#### Scenario: Function call arguments are not valid JSON
- **WHEN** a function call's arguments fail to parse
- **THEN** that call carries `args: null` and `argsError` with the raw string, and the turn still returns

### Requirement: Surface terminal non-success
The bridge SHALL return `failed`, `cancelled` and `incomplete` responses as results, not as MCP errors. Each SHALL carry the status and OpenAI's reason (for `incomplete`, the `incomplete_details.reason`).

#### Scenario: Output token cap reached
- **WHEN** a response ends `incomplete` because of `max_output_tokens`
- **THEN** the result has `status: "incomplete"`, `reason: "max_output_tokens"`, and any partial text and calls

### Requirement: Cancel a turn
The `cancel` tool SHALL cancel a running response by `id` and return its resulting status.

#### Scenario: Cancel during a long turn
- **WHEN** `cancel` is called while a response is `in_progress`
- **THEN** OpenAI is asked to cancel it, and the tool returns the status OpenAI reports

### Requirement: Retry transient OpenAI errors
The bridge SHALL retry HTTP 429 and 5xx responses with jittered backoff, within the call's `wait_ms`. It SHALL return other HTTP errors as MCP tool errors naming the status and OpenAI's message.

#### Scenario: Rate limited once
- **WHEN** OpenAI answers 429 and then succeeds
- **THEN** the caller sees only the successful result

#### Scenario: Bad request
- **WHEN** OpenAI answers 400 (for example, an unknown model)
- **THEN** the tool result has `isError: true` and names `400` and OpenAI's message

### Requirement: Read the key from the Keychain
The bridge SHALL read its OpenAI API key from the macOS Keychain generic-password item `openai`. `OPENAI_API_KEY` in the bridge's own environment SHALL override it. The key SHALL never appear in any tool result, log line or error.

#### Scenario: No key available
- **WHEN** neither the Keychain item nor `OPENAI_API_KEY` exists
- **THEN** every tool returns an error saying no OpenAI key was found, naming the Keychain item `openai`, and no request is sent

### Requirement: Report health
The `health` tool SHALL report the bridge version, whether a key was found (never the key), and whether `gpt-6.1-sol` is reachable with it.

#### Scenario: Key without model access
- **WHEN** the key is valid but OpenAI answers 404 for the model
- **THEN** `health` reports `key: "found"` and `model: "not available"`, with OpenAI's message
