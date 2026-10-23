# Spec Delta

## MODIFIED Requirements

### Requirement: Report function calls and usage
A finished turn SHALL list each function call as `{ call_id, name, args }` (with `args` parsed from JSON), its output text joined as `text` (followed by a `Sources:` list of any `url_citation` links, so web citations stay visible), and token usage including cached input and cache writes.

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
`costUsd` SHALL be priced from a finished turn's usage at the model's rates per million tokens, plus its web searches:

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

#### Scenario: Long prompt
- **WHEN** a `gpt-6.1-sol` turn's prompt is 300,000 input tokens
- **THEN** its input is priced at $4.00 per million tokens and its output at $15.00

## ADDED Requirements

### Requirement: Price web searches
`costUsd` SHALL add $0.01 per web search, counted by OpenAI's `tool_usage.web_search.num_requests` where present and otherwise one per `search` action. Opening a page or searching within one SHALL add nothing beyond its tokens.

#### Scenario: OpenAI's own count
- **WHEN** a turn has one `search` action and OpenAI's `tool_usage.web_search.num_requests` is 2
- **THEN** `costUsd` includes $0.02 for web searches

### Requirement: Report web activity
A finished turn SHALL list its web actions as `webActions`, each `{ type, query?, url?, sources?, pages? }`. `query` is a search's query or a find-in-page pattern, `sources` lists the URLs a search consulted, and `pages` lists the URLs of the pages an action returned. It SHALL list the cited URLs as `citations`, and as `notices` anything else the web tool returned (each at most 200 characters), along with any web action whose status isn't `completed`. Page text SHALL NOT be returned.

#### Scenario: One action opens many pages
- **WHEN** one `open_page` action returns 13 pages
- **THEN** its entry's `pages` lists all 13 URLs, and the turn carries none of their text

### Requirement: Read web results once
Every read of a stored response SHALL ask OpenAI to include `web_search_call.action.sources`, and so SHALL a create that carries the `web_search` tool. When a turn is terminal and has a web action, the bridge SHALL read it once more, also including `web_search_call.results`, and build `pages` and `notices` from that read. Polls of a running turn SHALL NOT include results.

#### Scenario: Finished web turn
- **WHEN** a polled turn completes with web actions
- **THEN** the bridge makes one more read that includes `web_search_call.results`, and the returned turn has `pages` on its page actions
