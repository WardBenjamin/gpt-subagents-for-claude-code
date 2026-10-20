# gpt-bridge Specification

## Purpose
The `gpt` plugin's local MCP server (`bridge`): it runs GPT turns on the OpenAI Responses API for the plugin's mod, long-polls them within one MCP call's time, and reports each turn's text, function calls, usage and cost.

## Requirements

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
A finished turn SHALL list each function call as `{ call_id, name, args }` (with `args` parsed from JSON), its output text joined as `text` (followed by a `Sources:` list of any `url_citation` links, so web citations stay visible), its web actions as `webActions` (each `{ type, query?, url? }`), and token usage including cached input and cache writes.

#### Scenario: Turn ends with function calls
- **WHEN** GPT answers with two function calls and no text
- **THEN** `calls` holds both, in order, with parsed `args`, and `text` is empty

#### Scenario: Function call arguments are not valid JSON
- **WHEN** a function call's arguments fail to parse
- **THEN** that call carries `args: null` and `argsError` with the raw string, and the turn still returns

### Requirement: Price each turn
`costUsd` SHALL be priced from a finished turn's usage at the model's rates per million tokens, plus $0.01 per web search action:

| Model | Input | Cached input | Cache writes | Output |
| --- | --- | --- | --- | --- |
| `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 | $10.00 |
| `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.10 | $0.50 |

For a prompt over 272,000 input tokens, the input, cached and cache-write rates SHALL double, and the output rate SHALL be 1.5×.

#### Scenario: Turn with web searches
- **WHEN** a `gpt-6-luna` turn makes two web searches
- **THEN** `webActions` lists both with their queries, and `costUsd` includes $0.02 for them

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
On macOS, the bridge SHALL read its OpenAI API key from the Keychain generic-password item `openai`. On every platform, `OPENAI_API_KEY` in the bridge's own environment SHALL override any key store. The key SHALL never appear in any tool result, log line or error.

#### Scenario: Key in the Keychain
- **WHEN** the bridge runs on macOS, `OPENAI_API_KEY` is unset, and the Keychain holds the item `openai`
- **THEN** the bridge uses that item's secret as the key

#### Scenario: Environment override
- **WHEN** `OPENAI_API_KEY` is set in the bridge's environment
- **THEN** the bridge uses that value and does not query any key store

#### Scenario: No key available
- **WHEN** the bridge runs on macOS and neither the Keychain item nor `OPENAI_API_KEY` exists
- **THEN** every tool returns an error saying no OpenAI key was found, naming the Keychain item `openai`, and no request is sent

### Requirement: Report health
The `health` tool SHALL report the bridge version, whether a key was found (never the key), and whether `gpt-6.1-sol` is reachable with it.

#### Scenario: Key without model access
- **WHEN** the key is valid but OpenAI answers 404 for the model
- **THEN** `health` reports `key: "found"` and `model: "not available"`, with OpenAI's message

### Requirement: Cancel turns whose caller is gone
The bridge SHALL cancel an in-progress OpenAI response when the MCP request polling it (`turn` or `wait`) is cancelled. It SHALL also cancel a response that no `turn` or `wait` call has polled for 60 seconds.

#### Scenario: Caller's request cancelled
- **WHEN** a `wait` request is cancelled by the MCP client while its response is in progress
- **THEN** the bridge stops polling and cancels that response at OpenAI

#### Scenario: Caller stopped polling
- **WHEN** `turn` returned `in_progress` and no `wait` for that id arrives within 60 seconds
- **THEN** the bridge cancels that response at OpenAI

### Requirement: Read the key from the Secret Service on Linux
On Linux, when `OPENAI_API_KEY` is not set in the bridge's environment, the bridge SHALL read its OpenAI API key from the freedesktop Secret Service item with the attribute `service` = `openai`, as `secret-tool lookup service openai` returns it.

#### Scenario: Key stored in the keyring
- **WHEN** the bridge runs on Linux, `OPENAI_API_KEY` is unset, and the Secret Service holds an item with `service` = `openai`
- **THEN** the bridge uses that item's secret as the key

#### Scenario: Environment override on Linux
- **WHEN** the bridge runs on Linux with `OPENAI_API_KEY` set
- **THEN** the bridge uses that value and does not query the Secret Service

### Requirement: Fall back to a key file on Linux
On Linux, when the Secret Service gives no key (no D-Bus session, a locked keyring, no matching item, `secret-tool` missing, or no answer within 15 s), the bridge SHALL read the key from `$XDG_CONFIG_HOME/gpt/openai-key`, or `~/.config/gpt/openai-key` when `XDG_CONFIG_HOME` is unset, ignoring surrounding whitespace. The bridge SHALL refuse the file if its group or other users have any access to it.

#### Scenario: Headless host with a key file
- **WHEN** the bridge runs on Linux with no D-Bus session, and `~/.config/gpt/openai-key` has mode `0600` and holds a key followed by a newline
- **THEN** the bridge uses the key without the newline

#### Scenario: Keyring hit wins over the file
- **WHEN** both the Secret Service item and the key file hold a key
- **THEN** the bridge uses the Secret Service key and does not read the file

#### Scenario: Key file readable by others
- **WHEN** the key file has mode `0644`
- **THEN** every tool returns an error naming the file and `chmod 600`, the error does not contain the key, and no request is sent to OpenAI

### Requirement: Name the platform's key store when no key is found
When no key is found, the bridge's error SHALL name the key store and the command that fills it for the platform it runs on, and SHALL mention `OPENAI_API_KEY`. The error SHALL never contain a key.

#### Scenario: No key on macOS
- **WHEN** the bridge runs on macOS, `OPENAI_API_KEY` is unset, and the Keychain has no item `openai`
- **THEN** every tool returns an error naming the Keychain item `openai` and `security add-generic-password -s openai -a "$USER" -w`

#### Scenario: No key on Linux
- **WHEN** the bridge runs on Linux, `OPENAI_API_KEY` is unset, the Secret Service gives no key and the key file does not exist
- **THEN** every tool returns an error naming `secret-tool store --label='OpenAI API key' service openai` (from `libsecret-tools`) and the key file's full path, and no request is sent to OpenAI
