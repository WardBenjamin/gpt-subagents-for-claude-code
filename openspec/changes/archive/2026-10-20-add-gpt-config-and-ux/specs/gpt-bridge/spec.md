# Spec Delta

## MODIFIED Requirements

### Requirement: Report function calls and usage
A finished turn SHALL list each function call as `{ call_id, name, args }` (with `args` parsed from JSON), its output text joined as `text` (followed by a `Sources:` list of any `url_citation` links, so web citations stay visible), its web actions as `webActions` (each `{ type, query?, url? }`), and token usage including cached input and cache writes. `costUsd` SHALL be priced from that usage at the model's rates per million tokens, plus $0.01 per web search action:

| Model | Input | Cached input | Cache writes | Output |
| --- | --- | --- | --- | --- |
| `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 | $10.00 |
| `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.10 | $0.50 |

For a prompt over 272,000 input tokens, the input, cached and cache-write rates SHALL double, and the output rate SHALL be 1.5×.

#### Scenario: Turn ends with function calls
- **WHEN** GPT answers with two function calls and no text
- **THEN** `calls` holds both, in order, with parsed `args`, and `text` is empty

#### Scenario: Function call arguments are not valid JSON
- **WHEN** a function call's arguments fail to parse
- **THEN** that call carries `args: null` and `argsError` with the raw string, and the turn still returns

#### Scenario: Turn with web searches
- **WHEN** a `gpt-6-luna` turn makes two web searches
- **THEN** `webActions` lists both with their queries, and `costUsd` includes $0.02 for them
