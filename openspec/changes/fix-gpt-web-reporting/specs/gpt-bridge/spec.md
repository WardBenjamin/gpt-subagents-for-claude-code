# Spec Delta

## MODIFIED Requirements

### Requirement: Report function calls and usage
A finished turn SHALL list each function call as `{ call_id, name, args }` (with `args` parsed from JSON), its output text joined as `text` (followed by a `Sources:` list of any `url_citation` links, so web citations stay visible), its web actions as `webActions` (each `{ type, query?, url?, sources? }`, where `query` is a search's query or a find-in-page pattern and `sources` lists the URLs a search consulted), the cited URLs as `citations`, and token usage including cached input and cache writes. A create that carries the `web_search` tool, and every read of a stored response, SHALL ask OpenAI to include `web_search_call.action.sources`.

#### Scenario: Turn ends with function calls
- **WHEN** GPT answers with two function calls and no text
- **THEN** `calls` holds both, in order, with parsed `args`, and `text` is empty

#### Scenario: Function call arguments are not valid JSON
- **WHEN** a function call's arguments fail to parse
- **THEN** that call carries `args: null` and `argsError` with the raw string, and the turn still returns

#### Scenario: Search sources
- **WHEN** a web search consults three pages and GPT cites one of them
- **THEN** that search's entry in `webActions` lists all three URLs in `sources`

### Requirement: Price each turn
`costUsd` SHALL be priced from a finished turn's usage at the model's rates per million tokens, plus $0.01 per web search, counted by OpenAI's `tool_usage.web_search.num_requests` where present and otherwise one per `search` action. Opening a page or searching within one SHALL add nothing beyond its tokens.

| Model | Input | Cached input | Cache writes | Output |
| --- | --- | --- | --- | --- |
| `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 | $10.00 |
| `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.10 | $0.50 |

For a prompt over 272,000 input tokens, the input, cached and cache-write rates SHALL double, and the output rate SHALL be 1.5×.

#### Scenario: Turn with web searches
- **WHEN** a `gpt-6-luna` turn makes two web searches
- **THEN** `webActions` lists both with their queries, and `costUsd` includes $0.02 for them

#### Scenario: Pages opened
- **WHEN** a turn makes one search and opens two pages
- **THEN** `costUsd` includes $0.01 for web actions
