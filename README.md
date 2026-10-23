# GPT subagents for Claude Code

`gpt` is a Claude Code plugin that runs OpenAI's GPT models as native Claude Code subagents. Claude dispatches `gpt:sol`, `gpt:astra` or `gpt:luna` with its ordinary `Agent` tool. What runs is a real subagent: it has its own transcript and task row, can run in the background, hands back a report, and takes `SendMessage` follow-ups. GPT answers every one of its model steps, so those steps use no Anthropic tokens. GPT's tool calls (`Read`, `Edit`, `Write`, `Bash`) run inside Claude Code under the session's own permission rules.

This is an independent project. It isn't made or endorsed by Anthropic or OpenAI. **Status: 0.5.0, a preview.**

## How it works

- **The mod** (`src/hooks/`) registers the three `gpt:*` agent types. It answers each model step of a `gpt:*` subagent with a GPT turn, and makes no Anthropic request for that step. Claude Code then runs GPT's tool calls as the subagent's own.
- **The bridge** (`src/bridge/`) is a local stdio MCP server. It runs GPT turns on the OpenAI Responses API in background mode, through five tools: `turn`, `wait`, `result`, `cancel` and `health`. It reads your OpenAI key from the OS key store and strips the key from everything it returns. It has no npm dependencies.

## Requirements

- **Claude Code 2.1.299 or later**, used locally: Desktop's Code tab, the CLI or VS Code. Tested on 2.1.299 (Desktop) and 2.1.304 (CLI).
- **Node 24.2 or later** on the `PATH` Claude Code starts servers with. The bridge's TypeScript runs directly on Node, with no build step:
  ```bash
  node --version
  ```
- **An OpenAI API key** in a project with billing and access to the models you'll use (`gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`). A ChatGPT subscription login won't work.
- **macOS or Linux** for the built-in key stores. Elsewhere, set `OPENAI_API_KEY` (see "Store your OpenAI key"); that's untested.

## Install

1. Store your OpenAI key (next section).
2. Add the marketplace and install the plugin at user scope, so every local session loads it:
   ```bash
   claude plugin marketplace add WardBenjamin/gpt-subagents-for-claude-code
   ```
   ```bash
   claude plugin install gpt@gpt-subagents --scope user
   ```
   In the desktop app instead: click **+** next to the prompt box, then **Plugins**, **Add marketplace** (`WardBenjamin/gpt-subagents-for-claude-code`), then **Add plugin**.
3. Allow the bridge's tools in your user settings (`~/.claude/settings.json`). In auto mode, Claude Code refuses the plugin's own calls to its bridge unless a rule allows them. Rules in user settings apply in every folder a session starts in:
   ```json
   { "permissions": { "allow": [
     "mcp__plugin_gpt_bridge__turn", "mcp__plugin_gpt_bridge__wait",
     "mcp__plugin_gpt_bridge__result", "mcp__plugin_gpt_bridge__cancel",
     "mcp__plugin_gpt_bridge__health"
   ] } }
   ```
4. Start a new session, and ask Claude to call `mcp__plugin_gpt_bridge__health`. It should report `"key": "found"` and `"model": "available"`, and `gpt:sol`, `gpt:astra` and `gpt:luna` should be in Claude's agent list.

Nothing else is needed: no `npm install` and no build.

## Store your OpenAI key

The bridge looks for the key in this order:
1. `OPENAI_API_KEY` in its own environment;
2. on macOS, the Keychain;
3. on Linux, the Secret Service keyring, then a key file.

It never writes the key anywhere.

**macOS:** the generic-password item `openai`. With `-w` and no value, `security` prompts for the key twice, so it stays out of your shell history:
```bash
security add-generic-password -s openai -a "$USER" -w
```
Check that it's there without printing it:
```bash
security find-generic-password -s openai > /dev/null && echo found
```
To replace the key later, run the same `add-generic-password` command with `-U`. To delete it, run `security delete-generic-password -s openai`.

**Linux with a desktop keyring** (gnome-keyring, KWallet or KeePassXC, through `secret-tool` from `libsecret-tools`):
```bash
secret-tool store --label='OpenAI API key' service openai
```
```bash
secret-tool lookup service openai > /dev/null && echo found
```

**Headless Linux** (no D-Bus session or no unlocked keyring): use a key file only you can read. The bridge refuses the file if group or other users have any access to it.
```bash
mkdir -p ~/.config/gpt && install -m 600 /dev/null ~/.config/gpt/openai-key
```
Then paste the key into `~/.config/gpt/openai-key` with an editor. If `XDG_CONFIG_HOME` is set, the file goes under `$XDG_CONFIG_HOME/gpt/` instead. The file is plain text at rest, so use it only where no keyring works.

**`OPENAI_API_KEY`** in the bridge's environment overrides every store. Don't set it in `~/.claude/settings.json` `env`: every session, and every command those sessions run, would then see the key.

The bridge keeps a key once it has read one. After you rotate the key, run `/reload-plugins` or start a new session.

## Use

Each agent type runs one model. Prices are OpenAI's list prices per million tokens, as of 2026-10-19:

| Type | Model | Input / cached / output | Use it for |
| --- | --- | --- | --- |
| `gpt:sol` | `gpt-6.1-sol` | $2 / $0.10 / $10 | The default: near-Astra coding at a fifth of the price. |
| `gpt:astra` | `gpt-6-astra` | $10 / $1 / $50 | The hardest problems. |
| `gpt:luna` | `gpt-6-luna` | $0.10 / $0.01 / $0.50 | Simple, high-volume work. |

Prompts over 272K tokens cost 2× for input and 1.5× for output.

Ask Claude to delegate, for example:

> Dispatch a gpt:sol agent at high effort to review `src/bridge/responses.ts` for error-handling gaps.

Claude then calls `Agent(subagent_type: "gpt:sol", effort: "high", ...)`. The effort levels `low` to `max` map directly to GPT's reasoning effort. With no effort given, a step uses the session's effort, or `high` if the session has none. To follow up, Claude calls `SendMessage` with the agent's id or name, and GPT continues with its earlier context.

## Permissions by mode

GPT's tool calls go through the same permission system as Claude's. How they're decided depends on the session's mode:

- **`acceptEdits` or default mode:** GPT edits files the way Claude would in that mode. `acceptEdits` approves the edits; default mode asks you through the normal dialog.
- **Auto mode with server review (the default): GPT is read-only.**
  - **Why:** under server review, the verdict on an action comes back with the Anthropic model request that produced it. GPT's actions have no such request, so Claude Code refuses its `Edit` and `Write` calls.
  - **What still runs:** `Read`, and plainly read-only `Bash`: one simple command, such as `rg -n foo src`. Compound commands, pipes and scripts get "no verdict".
  - **Where GPT can write:** two exceptions apply. One is the session's scratchpad directory. The other is any folder a user allow rule covers, such as `Edit(//abs/path/**)`.
  - **What GPT is told:** run one simple command per call, prefer `Read`, and don't retry after a "no verdict". It keeps its notes and artifacts in the scratchpad path its task names, so Claude can move them into the project with its own reviewed action.
  - **The hand-back:** GPT's report arrives with a note that the classifier couldn't review the work.
  
  This mode suits reviews and research.
- **Auto mode with the local classifier: GPT is reviewed like Claude.**
  - **How to turn it on:** start the session with `CLAUDE_CODE_AUTO_MODE_SERVER=0`. Claude Code's own classifier then judges every action against the transcript, GPT's included, and GPT's in-project edits are approved the same way Claude's are.
  - **Scope:** it's a session-wide setting, read once at start. Put it before `claude` for a single CLI session, or in `env` in a project's `.claude/settings.local.json` for sessions started in that folder. In `~/.claude/settings.json` it applies to every session.
  - **Checking it:** in the CLI, `/status` shows "Auto mode server: Disabled". In any surface, the `gpt:*` agent descriptions say which kind of review applies, so Claude knows at dispatch whether GPT can edit.
  - **Caveats:** Anthropic documents the variable as temporary. The classifier's own requests count toward usage on Enterprise and API plans.

Only the plugin may call the bridge's `turn`, `wait`, `result` and `cancel` tools; Claude can call `health`.

## Settings

**In any session, Desktop included:** `/gpt settings` lists the settings with the values the session runs on. `/gpt settings <name> <value>` changes one, for example `/gpt settings webCacheOnly on`, `/gpt settings maxUsd 2` or `/gpt settings effort medium`. Booleans take `on` or `off`. Claude Code reloads the plugin when a setting changes, so the value applies from the session's next GPT step, in every open session. Change settings between GPT runs. If a session still shows the old value, run `/reload-plugins`.

Desktop's own settings screens don't show plugin options for a marketplace you added, which is why the command exists. Other ways to change them:
- **In a terminal session:** `/config` under the `gpt` plugin, or `/plugin configure gpt@gpt-subagents`.
- **Ask Claude**, for example "turn on GPT web cache-only mode". It edits `settings.json` with its `/update-config` skill, under your usual permissions.
- **From the shell:**

  ```sh
  echo '{"web":"true","webCacheOnly":"false"}' | claude plugin configure gpt@gpt-subagents --values-stdin
  ```

  Values are strings, and options you leave out keep their values. `claude plugin configure gpt@gpt-subagents` with no input lists the options and which are set.
- **In `~/.claude/settings.json`,** under `pluginConfigs` (example under [Web access](#web-access)).

| Setting | Default | Effect |
| --- | --- | --- |
| GPT effort | `inherit` | `inherit` uses the Agent call's effort, else the session's. A level from `low` to `max` overrides it for every GPT step. |
| GPT step cap | 60 | A run stops after this many GPT steps. |
| GPT cost cap (USD) | 5 | A run stops once its estimated OpenAI cost reaches this. An astra run reaches the default sooner. |
| GPT web access | off | Gives GPT OpenAI's hosted web search. See [Web access](#web-access). |
| GPT web: cache only | off | With web access on, uses only OpenAI's cached pages. See [Web access](#web-access). |
| GPT web budget | `default` | How much page content OpenAI's web search may return to GPT in a run: `default` or `unlimited`. See [Web access](#web-access). |

## Web access

GPT's web access is OpenAI's hosted `web_search` tool, not Claude Code's. One tool does the jobs of both of Claude's web tools: it **searches** (Claude's `WebSearch`), and it **opens pages and finds text in them** (Claude's `WebFetch`). It all runs at OpenAI, under OpenAI's site access and safeguards, and outside Claude Code's permission system. That's why it's off by default.

**Modes.** Two switches give three modes:

| Mode | GPT web access | GPT web: cache only | What OpenAI gets |
| --- | --- | --- | --- |
| off | off | (ignored) | No web tool. |
| live | on | off | `{ "type": "web_search" }`: live searches and page fetches. |
| cached | on | on | `{ "type": "web_search", "external_web_access": false }`: OpenAI's cached copies only, never a live fetch, so some pages are missing. |

**Switching.** `/gpt settings web on`, then `/gpt settings webCacheOnly on` for cached mode, or any of the other ways under [Settings](#settings). In `~/.claude/settings.json` they're keyed by the installed plugin's id:

```json
{
  "pluginConfigs": {
    "gpt@gpt-subagents": { "options": { "web": true, "webCacheOnly": false } }
  }
}
```

The agent listing changes at the next session start.

**What Claude sees.** With web on, the `gpt:*` types are listed with `WebSearch` and `WebFetch` after `Read`, `Edit`, `Write` and `Bash`, and their description names the mode. So Claude prompts them as it would any agent with web tools: "search for…", "read <url> and…". GPT uses the web only when the task needs it. Writing "no web" in the prompt keeps it off for that dispatch. Claude Code's own `WebSearch` and `WebFetch` never run for a GPT agent: the plugin refuses them.

**What gets reported.** Each web action appears in the subagent's transcript as it happens (`[web] searched "…"`, `[web] opened …`). Pages GPT cites are listed under `Sources:`. The report Claude receives ends with a **Web activity** list, built by the plugin from OpenAI's record rather than from GPT's text. It shows:
- each search, with how many results it listed;
- each page action with the pages it returned. One action can open a batch of pages, such as "opened 13 pages", and each page is listed once in the run;
- any page GPT cited that no action returned, marked as found in search results or not seen;
- anything else the web tool said, such as a refusal.

GPT is also told to say "opened" only for pages it opened. Page text never reaches Claude.

**Web budget.** OpenAI caps how much page content its web search returns to GPT in a run. GPT may say the web tool stopped giving it pages, and the list may show what the tool said. If so, `/gpt settings webBudget unlimited` removes the cap (`return_token_budget: "unlimited"`), which can make runs slower and cost more. OpenAI doesn't publish the default cap's size. 47 short release-note pages fit within it.

**Costs.** Each search costs $0.01, as OpenAI counts searches, plus the retrieved content at the model's input rate. Opening or searching a page costs only its tokens. Both appear in `/gpt cost`.

**Limits.**
- OpenAI reaches public pages only, subject to its own site access: localhost and private network addresses can't be read.
- There's no per-dispatch switch (the Agent tool can't carry one), no search-only or fetch-only mode (OpenAI's tool has none), and no domain filters yet.

## Costs

- **What you pay OpenAI:** the GPT steps. They're billed to your OpenAI account and capped per run by the step and cost caps. A run that hits a cap stops and says which cap it reached.
- **What you pay Anthropic:** Claude's own turns, including the dispatch and reading GPT's report, and the classifier's requests if you use the local classifier. The GPT steps themselves use no Anthropic tokens.
- **`/gpt status`** lists this session's GPT runs, finished ones included, with type, id, state, steps and estimated cost.
- **`/gpt cost`** shows this session's spend by model, then spend by month and model across sessions.

These figures are estimates from list prices; your OpenAI dashboard is the source of truth.

## Limitations

- **Preview.** Behavior and settings may change before 1.0.
- **Auto mode with server review is read-only for GPT**, apart from the scratchpad and allow-ruled folders (see "Permissions by mode").
- **Tools:** GPT gets `Read`, `Edit`, `Write` and `Bash`, plus OpenAI web search if enabled (listed to Claude as `WebSearch` and `WebFetch`). It doesn't get Claude Code's other tools, MCP servers or skills.
- **Transcript labels:** GPT's entries in a subagent transcript carry the session's Claude model id. Desktop's transcript view shows that model rather than the GPT model. The token count Claude Code shows for a GPT subagent isn't Anthropic usage.
- **Stopping a run** cancels its OpenAI response. The bridge also cancels any response nobody has polled for 60 seconds.
- **Linux key stores** were checked in a Debian container, with gnome-keyring and headless, not on a full desktop. Windows is untested.

## Repository layout

- `src/` is the plugin itself: `.claude-plugin/plugin.json`, `hooks/`, `bridge/`, `tests/` and `CHANGELOG.md`.
- `.claude-plugin/marketplace.json` makes the repository a one-plugin marketplace, `gpt-subagents`.
- `openspec/` holds the specs and the design record of each change (OpenSpec).
- `repos/` holds git submodules of upstream projects (`anthropics/claude-code`, `anthropics/claude-plugins-official`, `openai/codex`, `openai/codex-plugin-cc`). They're only reference code used during development. Neither installing nor developing needs them, so you don't need to initialize them.

## Develop

Run the bridge's tests, then the mod's tests. The first needs `npm install` once, at the repository root: the tests drive the bridge with the MCP SDK's client. The plugin itself has no dependencies.
```bash
npm test
```
```bash
claude plugin test src
```

Validate the plugin, then the marketplace (run that one from the repository root):
```bash
claude plugin validate src
```
```bash
claude plugin validate .
```

- **What the tests cover:** the bridge's tests (`src/bridge/*.spec.ts`) replay recorded Responses API JSON from `src/bridge/fixtures/`, and the mod's tests (`src/tests/*.test.ts`) stub the bridge and the transcript. Neither makes network calls.
- **Versions:** `npm test` checks that the version agrees in `src/.claude-plugin/plugin.json`, `src/package.json` and the top entry of `src/CHANGELOG.md`.
- **A live dev loop:** add your clone as a folder marketplace with `claude plugin marketplace add "$PWD"`, and install `gpt@gpt-subagents`. A folder marketplace is read live. After an edit, `/reload-plugins` picks up hook changes; a bridge change needs a new session.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE)
