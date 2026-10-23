import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import { money } from '../hooks/gpt-command'
import type { Engine } from 'claude-code/testing'

tier('user')

type Turn = Record<string, unknown>

/** The world beneath the mod: one subagent of `type`, its transcript, and a bridge answering `turns` in order. */
function world(on: On, type: string, turns: Array<Turn | Error | string>, offersHandback = true, autoModeServer?: string) {
  const bridgeCalls: Array<{ tool: string; args: Record<string, unknown> }> = []
  let nextCalled = false
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  const registered: any[] = []
  on('agent.register', ($, e) => (registered.push(e), { value: { agent: `gpt:${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const agents: any[] = [{ id: 'agent1', type, description: 'task', status: 'running' }]
  on('agent.list', () => ({ value: agents }))
  on('session.messages', ($, e) => (e.as === 'api'
    ? { value: [{ role: 'user', content: offersHandback ? 'Summarize /work/a.txt\n<reminder>Your final report is delivered through SubagentHandback</reminder>' : 'Summarize /work/a.txt' }] as any }
    : { value: [{ role: 'user', text: 'Summarize /work/a.txt', toolUses: [] }] as any }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: autoModeServer }))
  on('fs.read', () => ({ value: '' }))
  on('mcp.call', ($, e) => {
    bridgeCalls.push({ tool: e.tool, args: e.args })
    const t = turns.shift() ?? new Error('no scripted turn')
    if (t instanceof Error) return { value: { content: [{ type: 'text', text: t.message }], isError: true } }
    return { value: { content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t) }], isError: false } }
  })
  on('turn.step', async function* (_$, e) {
    nextCalled = true
    yield { kind: 'text' as const, index: 0, text: 'claude answer' }
    return { turnId: e.turnId, index: e.index, answer: 'claude answer', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  return { bridgeCalls, agents, registered, nextCalled: () => nextCalled }
}

async function step($: Engine, index = 0) {
  const stream = $.turn.step({ turnId: 'turn1', index, model: 'claude-opus-5-5', messageCount: 1, agentId: 'agent1' })
  const chunks: unknown[] = []
  for (let r = await stream.next(); ; r = await stream.next()) {
    if (r.done) return { chunks, result: r.value }
    chunks.push(r.value)
  }
}

const start = ($: Engine) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' } as any)

describe('register', () => {
  test('steps of other agent types go to their own model', async ($, on) => {
    const w = world(on, 'Explore', [])
    await start($)
    const { result } = await step($)
    expect(result.answer).toBe('claude answer')
    expect(w.nextCalled()).toBe(true)
    expect(w.bridgeCalls).toEqual([])
  })

  test('a gpt:sol step is answered by GPT and never reaches the model beneath', async ($, on) => {
    const w = world(on, 'gpt:sol', [
      { id: 'resp_1', status: 'completed', text: '', calls: [{ call_id: 'call_r', name: 'Read', args: { file_path: '/work/a.txt' } }], usage: { input: 50, cached: 0, output: 5 }, costUsd: 0.00015 },
    ])
    await start($)
    const { result } = await step($)
    expect(w.nextCalled()).toBe(false)
    expect(result.toolUses).toEqual([{ name: 'Read', input: { file_path: '/work/a.txt' } }])
    expect(result.stopReason).toBe('tool_use')
    expect(w.bridgeCalls[0]?.tool).toBe('turn')
    expect(w.bridgeCalls[0]?.args).toMatchObject({ model: 'gpt-6.1-sol', effort: 'high', input: 'Summarize /work/a.txt', wait_ms: 20000 })
  })

  test('an in-progress turn is long-polled with wait until it completes', async ($, on) => {
    const w = world(on, 'gpt:sol', [
      { id: 'resp_2', status: 'in_progress' },
      { id: 'resp_2', status: 'completed', text: 'All done.', calls: [] },
    ])
    await start($)
    const { result } = await step($)
    expect(w.bridgeCalls.map(c => c.tool)).toEqual(['turn', 'wait'])
    expect(result.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: 'All done.' } }])
  })

  test('where the engine offers no SubagentHandback, the report is the final text', async ($, on) => {
    world(on, 'gpt:sol', [{ id: 'resp_t', status: 'completed', text: 'Summary: hello.', calls: [] }], false)
    await start($)
    const { chunks, result } = await step($)
    expect([result.answer, result.stopReason, result.toolUses, result.usage]).toEqual(['Summary: hello.', 'end_turn', [], null])
    expect(chunks[0]).toEqual({ kind: 'text', index: 0, text: 'Summary: hello.' })
  })

  test('a bridge error ends the run with a hand-back, never the model beneath', async ($, on) => {
    const w = world(on, 'gpt:sol', [new Error('OpenAI 401: Incorrect API key provided: [redacted].')])
    await start($)
    const { result } = await step($)
    expect(w.nextCalled()).toBe(false)
    expect(result.toolUses).toEqual([
      { name: 'SubagentHandback', input: { message: 'GPT run failed: OpenAI 401: Incorrect API key provided: [redacted].' } },
    ])
  })

  test('a paged turn is read back page by page with result', async ($, on) => {
    const turn = { id: 'resp_big', status: 'completed', text: '', calls: [{ call_id: 'call_w', name: 'Write', args: { file_path: '/work/r.md', content: 'x'.repeat(30) } }] }
    const json = JSON.stringify(turn)
    const w = world(on, 'gpt:sol', [{ id: 'resp_big', status: 'completed', pages: 2, length: json.length }, json.slice(0, 40), json.slice(40)])
    await start($)
    const { result } = await step($)
    expect(w.bridgeCalls.slice(1)).toEqual([{ tool: 'result', args: { id: 'resp_big', page: 0 } }, { tool: 'result', args: { id: 'resp_big', page: 1 } }])
    expect(result.toolUses).toEqual([{ name: 'Write', input: turn.calls[0]!.args }])
  })

  test('a page Claude Code swapped for its note fails the run, even where the joined pages still parse', async ($, on) => {
    const content = 'x'.repeat(300)
    const json = JSON.stringify({ id: 'resp_big', status: 'completed', text: '', calls: [{ call_id: 'call_w', name: 'Write', args: { file_path: '/work/r.md', content } }] })
    const note = '[OUTPUT TRUNCATED - exceeded 25000 token limit] The tool output was truncated.'
    const at = json.indexOf(content) + 100 // the middle page lies inside the Write's content string
    const w = world(on, 'gpt:sol', [{ id: 'resp_big', status: 'completed', pages: 3, length: json.length }, json.slice(0, at), note, json.slice(at + 100)])
    await start($)
    const { result } = await step($)
    expect(w.bridgeCalls).toHaveLength(4)
    expect(result.toolUses.map(u => u.name)).toEqual(['SubagentHandback']) // no Write runs
    expect(JSON.stringify(result.toolUses)).toContain(`GPT run failed: the bridge's result pages for resp_big came to ${json.length - 100 + note.length} of ${json.length} characters: ${note}`)
  })

  test("a result that is not JSON, such as Claude Code's over-the-cap note, fails the run naming it", async ($, on) => {
    const note = 'Error: result (69,218 characters) exceeds maximum allowed tokens. Output has been saved to /tmp/mcp-plugin_gpt_bridge-wait-1.txt'
    world(on, 'gpt:sol', [note])
    await start($)
    const { result } = await step($)
    expect(result.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: `GPT run failed: the bridge's turn answered with no JSON: ${note}` } }])
  })

  test('the cost cap stops the run at the next step', async ($, on) => {
    const w = world(on, 'gpt:sol', [
      { id: 'resp_3', status: 'completed', text: '', calls: [{ call_id: 'call_b', name: 'Bash', args: { command: 'ls' } }], costUsd: 5 },
    ])
    await start($)
    await step($, 0)
    const { result } = await step($, 1)
    expect(w.bridgeCalls).toHaveLength(1)
    expect(result.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: 'GPT run stopped: the $5 cost cap was reached.' } }])
  })

  test('each type goes to its own model; the effort setting overrides the step\'s', { options: { effort: 'medium' } }, async ($, on) => {
    const w = world(on, 'gpt:luna', [{ id: 'resp_l', status: 'completed', text: 'ok', calls: [] }])
    await start($)
    await step($)
    expect(w.bridgeCalls[0]?.args).toMatchObject({ model: 'gpt-6-luna', effort: 'medium' })
  })

  test('a lower cost cap stops an astra run at its next step', { options: { maxUsd: 1 } }, async ($, on) => {
    const w = world(on, 'gpt:astra', [
      { id: 'resp_a', status: 'completed', text: '', calls: [{ call_id: 'call_1', name: 'Bash', args: { command: 'ls' } }], costUsd: 1.2 },
    ])
    await start($)
    await step($, 0)
    const { result } = await step($, 1)
    expect(w.bridgeCalls[0]?.args).toMatchObject({ model: 'gpt-6-astra' })
    expect(w.bridgeCalls).toHaveLength(1)
    expect(result.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: 'GPT run stopped: the $1 cost cap was reached.' } }])
  })

  test('web access off: no web tool is sent', async ($, on) => {
    const w = world(on, 'gpt:sol', [{ id: 'resp_n', status: 'completed', text: 'ok', calls: [] }])
    await start($)
    await step($)
    expect(JSON.stringify(w.bridgeCalls[0]?.args.tools)).not.toContain('web_search')
  })

  test('web access on: OpenAI web_search is sent and each web action is a [web] line', { options: { web: true } }, async ($, on) => {
    const w = world(on, 'gpt:sol', [{
      id: 'resp_w', status: 'completed', text: 'Checking the file too.',
      webActions: [{ type: 'search', query: 'claude code mods' }, { type: 'open_page', url: 'https://example.com/a' }],
      calls: [{ call_id: 'call_r', name: 'Read', args: { file_path: '/work/a.txt' } }],
    }])
    await start($)
    const { chunks } = await step($)
    expect(w.bridgeCalls[0]?.args.tools).toContainEqual({ type: 'web_search' })
    expect(chunks[0]).toEqual({ kind: 'text', index: 0, text: '[web] searched "claude code mods"\n[web] opened https://example.com/a\n\nChecking the file too.' })
  })

  for (const [label, options, sent] of [
    ['live', { web: true }, { type: 'web_search' }],
    ['cached', { web: true, webCacheOnly: true }, { type: 'web_search', external_web_access: false }],
  ] as const) {
    test(`web ${label}: the type lists WebSearch and WebFetch, and GPT gets OpenAI's tool and the web rules`, { options }, async ($, on) => {
      const w = world(on, 'gpt:sol', [{ id: 'resp_m', status: 'completed', text: 'ok', calls: [] }])
      await start($)
      await step($)
      expect(w.registered[0].tools).toEqual(['Read', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch'])
      expect(w.registered[0].description).toContain(label === 'cached' ? 'cache-only mode' : 'searches and reads public pages')
      expect(w.bridgeCalls[0]?.args.tools).toContainEqual(sent)
      expect(String(w.bridgeCalls[0]?.args.instructions)).toContain('Say you opened a page only if you opened it.')
    })
  }

  for (const options of [{}, { web: false, webCacheOnly: true }]) {
    test(`web off (${JSON.stringify(options)}): no web tools listed or sent, no web rules`, { options }, async ($, on) => {
      const w = world(on, 'gpt:sol', [{ id: 'resp_o', status: 'completed', text: 'ok', calls: [] }])
      await start($)
      await step($)
      expect(w.registered[0].tools).toEqual(['Read', 'Edit', 'Write', 'Bash'])
      expect(JSON.stringify(w.bridgeCalls[0]?.args.tools)).not.toContain('web_search')
      expect(String(w.bridgeCalls[0]?.args.instructions)).not.toContain('OpenAI web search')
    })
  }

  test('the report ends with the run\'s web activity, across steps, marking what GPT cited without opening', { options: { web: true } }, async ($, on) => {
    world(on, 'gpt:sol', [
      { id: 'resp_w1', status: 'completed', text: '', costUsd: 0.01,
        webActions: [{ type: 'search', query: 'node 26 release', sources: ['https://nodejs.org/en/blog/release/v26.12.1', 'https://github.com/nodejs/node/releases'] }],
        calls: [{ call_id: 'call_1', name: 'Bash', args: { command: 'node --version' } }] },
      { id: 'resp_w2', status: 'completed', text: 'Node 26.12.1 is out.',
        webActions: [{ type: 'open_page', url: 'https://nodejs.org/en/blog/release/v26.12.1' }],
        citations: ['https://nodejs.org/en/blog/release/v26.12.1?utm_source=openai', 'https://github.com/nodejs/node/releases', 'https://example.com/elsewhere'] },
    ])
    await start($)
    await step($, 0)
    const { result } = await step($, 1)
    expect((result.toolUses[0]?.input as any).message).toBe([
      'Node 26.12.1 is out.',
      '',
      'Web activity (at OpenAI):',
      '- searched "node 26 release" (2 results)',
      '- opened https://nodejs.org/en/blog/release/v26.12.1',
      '- cited, not opened: https://github.com/nodejs/node/releases (in search results)',
      '- cited, not opened: https://example.com/elsewhere (not seen)',
    ].join('\n'))
  })

  test('one page action that returned 13 pages lists them all, and none of them reads as cited but not opened', { options: { web: true } }, async ($, on) => {
    const pages = Array.from({ length: 13 }, (_, i) => `https://nodejs.org/en/blog/release/v26.${i}.0`)
    world(on, 'gpt:sol', [{ id: 'resp_b', status: 'completed', text: 'Done.', webActions: [{ type: 'open_page', url: pages[12], pages }], citations: [pages[0], pages[5], `${pages[12]}?utm_source=openai`] }])
    await start($)
    const { result } = await step($)
    const message = (result.toolUses[0]?.input as any).message as string
    expect(message).toContain('- opened 13 pages:\n  - https://nodejs.org/en/blog/release/v26.0.0\n')
    expect(message.split('\n').filter(l => l.startsWith('  - ')).length).toBe(13)
    expect(message).not.toContain('cited, not opened')
  })

  for (const [budget, hint] of [['default', true], ['unlimited', false]] as const) {
    test(`the web tool's notices end the list, with the budget hint only on the default budget (${budget})`, { options: { web: true, webBudget: budget } }, async ($, on) => {
      const w = world(on, 'gpt:sol', [{ id: 'resp_t', status: 'completed', text: 'Partial.', webActions: [{ type: 'search', query: 'q', sources: ['https://a.example'] }], notices: ['Return token budget exhausted.'] }])
      await start($)
      const { result } = await step($)
      const message = (result.toolUses[0]?.input as any).message as string
      expect(message).toContain('- the web tool said: "Return token budget exhausted."')
      expect(message.includes('/gpt settings webBudget unlimited')).toBe(hint)
      expect(w.bridgeCalls[0]?.args.tools).toContainEqual(budget === 'unlimited' ? { type: 'web_search', return_token_budget: 'unlimited' } : { type: 'web_search' })
    })
  }

  test('a run that never used the web reports no web activity', { options: { web: true } }, async ($, on) => {
    world(on, 'gpt:sol', [{ id: 'resp_n2', status: 'completed', text: 'Done.', calls: [] }])
    await start($)
    const { result } = await step($)
    expect((result.toolUses[0]?.input as any).message).toBe('Done.')
  })

  test("Claude Code's web tools never run for a gpt:* agent; Claude's own WebSearch passes", { options: { web: true } }, async ($, on) => {
    world(on, 'gpt:sol', [{ id: 'resp_g', status: 'completed', text: '', calls: [{ call_id: 'call_1', name: 'Bash', args: { command: 'ls' } }] }])
    let ran = 0
    on('tool.call', () => (ran++, { result: 'searched' } as any))
    await start($)
    await step($) // the run is now known
    const call = $.tool.call as unknown as (input: object) => Promise<{ deny?: string }>
    const fromGpt = await call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'read', agentId: 'agent1' })
    expect(fromGpt.deny).toContain('runs at OpenAI')
    expect(ran).toBe(0)
    const fromClaude = await call({ tool: 'WebSearch', query: 'node 26', mode: 'standard' })
    expect(fromClaude.deny).toBeUndefined()
    expect(ran).toBe(1)
  })

  test('each GPT step adds its cost to the month\'s ledger, one run on the first step', async ($, on) => {
    let ledger: unknown
    on('store.get', () => ({ value: ledger }))
    on('store.set', ($, e) => ((ledger = e.value), { value: undefined }))
    world(on, 'gpt:sol', [
      { id: 'resp_c1', status: 'completed', text: '', calls: [{ call_id: 'call_1', name: 'Bash', args: { command: 'ls' } }], costUsd: 0.25 },
      { id: 'resp_c2', status: 'completed', text: '', calls: [{ call_id: 'call_2', name: 'Bash', args: { command: 'pwd' } }], costUsd: 0.5 },
    ])
    await start($)
    await step($, 0)
    await step($, 1)
    const month = new Date().toISOString().slice(0, 7)
    expect(ledger).toEqual({ [month]: { 'gpt-6.1-sol': { usd: 0.75, runs: 1, steps: 2 } } })
  })

  test('/gpt status lists this session\'s GPT runs, also once the engine drops them; /gpt cost adds this session; else usage', async ($, on) => {
    mock.store(on, { ledger: { '2026-01': { 'gpt-6-luna': { usd: 0.5, runs: 2, steps: 9 } } } })
    const w = world(on, 'gpt:sol', [{ id: 'resp_s', status: 'completed', text: '', calls: [{ call_id: 'call_1', name: 'Bash', args: { command: 'ls' } }], costUsd: 0.02 }])
    await start($)
    await step($)
    const run = (args: string) => $.command.run({ command: 'gpt', args, origin: { kind: 'composer' } } as any)
    expect((await run('status')).text).toContain('gpt:sol  agent1  running  1 steps  $0.02')
    w.agents.length = 0 // the engine dropped the finished subagent's task
    expect((await run('status')).text).toContain('gpt:sol  agent1  done  1 steps  $0.02')
    const cost = (await run('cost')).text
    expect(cost).toContain('This session: $0.02\n  gpt-6.1-sol  $0.02  1 runs  1 steps')
    expect(cost).toContain('gpt-6-luna  $0.50  2 runs  9 steps')
    expect((await run('')).text).toContain('Usage: /gpt status')
  })

  test('the types tell Claude whether auto mode lets GPT edit: CLAUDE_CODE_AUTO_MODE_SERVER off means local review', async ($, on) => {
    const notes: Record<string, string> = {}
    let descriptions: string[] = []
    let server: string | undefined
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('agent.register', ($, e) => (descriptions.push(e.description), { value: { agent: `gpt:${e.name}` } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('env.get', () => ({ value: server }))
    for (server of [undefined, '1', 'TRUE', '0', 'false', '']) {
      descriptions = []
      await start($)
      expect(descriptions).toHaveLength(3)
      notes[String(server)] = descriptions[0]!.includes('local classifier') ? 'local' : descriptions[0]!.includes('write only in your scratchpad directory') ? 'server' : '?'
    }
    expect(notes).toEqual({ undefined: 'server', 1: 'server', TRUE: 'server', 0: 'local', false: 'local', '': 'local' })
  })

  for (const [label, handback, server, rules] of [
    ['auto mode, server review', true, undefined, true],
    ['auto mode, local classifier', true, '0', false],
    ['other modes', false, undefined, false],
  ] as const) {
    test(`GPT gets the simple-command rules only under server review (${label})`, async ($, on) => {
      const w = world(on, 'gpt:sol', [{ id: 'resp_i', status: 'completed', text: 'ok', calls: [] }], handback, server)
      await start($)
      await step($)
      const text = String(w.bridgeCalls[0]?.args.instructions)
      expect([text.includes('one simple read-only command per Bash call'), text.includes('only in a scratchpad directory your task names')]).toEqual([rules, rules])
    })
  }

  /** A session for /gpt settings: the manifest's userConfig, /config rows or none, and the claude CLI. */
  function settingsWorld(on: On, opts: { rows?: boolean; listed?: (root: string) => string; configureExit?: number } = {}) {
    let root = ''
    const runs: Array<{ argv: readonly string[]; stdin?: string }> = []
    const sets: unknown[] = []
    const userConfig = {
      effort: { type: 'string', title: 'GPT effort', options: ['inherit', 'low', 'high'] },
      maxUsd: { type: 'number', title: 'GPT cost cap (USD)' },
      web: { type: 'boolean', title: 'GPT web access' },
      webCacheOnly: { type: 'boolean', title: 'GPT web: cache only' },
    }
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('agent.register', ($, e) => ({ value: { agent: `gpt:${e.name}` } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_CODE_EXECPATH' ? '/opt/claude' : undefined }))
    on('fs.read', ($, e) => {
      if (!e.path.endsWith('/.claude-plugin/plugin.json')) return { value: '' }
      root = e.path.slice(0, -'/.claude-plugin/plugin.json'.length)
      return { value: JSON.stringify({ name: 'gpt', userConfig }) }
    })
    on('config.list', () => ({ value: opts.rows ? [{ key: 'gpt.webCacheOnly', label: 'GPT web: cache only', kind: 'boolean', value: false, provider: { plugin: 'gpt@gpt-subagents', tier: 'user' }, isLocked: false }] as any : [] }))
    on('config.set', ($, e) => (sets.push({ key: e.key, value: e.value }), { value: e.value } as any))
    on('process.run', ($, e) => {
      runs.push({ argv: e.argv, stdin: e.init?.stdin as string | undefined })
      if (e.argv.includes('list')) return { value: { exitCode: 0, stdout: opts.listed?.(root) ?? '[]', stderr: '' } as any }
      return { value: { exitCode: opts.configureExit ?? 0, stdout: '', stderr: opts.configureExit ? 'Plugin not found' : '' } as any }
    })
    return { runs, sets }
  }
  const gpt = ($: Engine, args: string) => $.command.run({ command: 'gpt', args, origin: { kind: 'composer' } } as any)

  test('/gpt settings lists each setting with its running value, what it takes, and the web mode', { options: { web: true, webCacheOnly: true, maxUsd: 3 } }, async ($, on) => {
    settingsWorld(on)
    await start($)
    const text = (await gpt($, 'settings')).text
    expect(text).toContain('effort        inherit   inherit | low | high  (GPT effort)')
    expect(text).toContain('maxUsd        3         a number above 0')
    expect(text).toContain('webCacheOnly  on        on | off')
    expect(text).toContain('Web mode: cached.')
  })

  test('/gpt settings refuses an unknown name or a bad value, saving nothing', async ($, on) => {
    const w = settingsWorld(on)
    await start($)
    expect((await gpt($, 'settings maxUsd lots')).text).toBe('maxUsd takes a number above 0.')
    expect((await gpt($, 'settings effort huge')).text).toBe('effort takes inherit | low | high.')
    expect((await gpt($, 'settings colour blue')).text).toContain('No setting "colour".')
    expect(w.runs).toEqual([])
    expect(w.sets).toEqual([])
  })

  test('/gpt settings saves through $.config.set where the session has the /config row', async ($, on) => {
    const w = settingsWorld(on, { rows: true })
    await start($)
    expect((await gpt($, 'settings webcacheonly on')).text).toContain('Saved webCacheOnly = on.')
    expect(w.sets).toEqual([{ key: 'gpt.webCacheOnly', value: true }])
    expect(w.runs).toEqual([])
  })

  test('/gpt settings saves through claude plugin configure, by the installed id, where there are no rows', async ($, on) => {
    const w = settingsWorld(on, { listed: root => 'warning: a note first\n' + JSON.stringify([{ id: 'gpt@gpt-subagents', installPath: root }, { id: 'other@x', installPath: '/elsewhere' }]) })
    await start($)
    expect((await gpt($, 'settings maxUsd 2.5')).text).toContain('Saved maxUsd = 2.5.')
    expect(w.runs.map(r => r.argv)).toEqual([['/opt/claude', 'plugin', 'list', '--json'], ['/opt/claude', 'plugin', 'configure', 'gpt@gpt-subagents', '--values-stdin']])
    expect(w.runs[1]?.stdin).toBe('{"maxUsd":"2.5"}')
  })

  test('/gpt settings finds a folder-marketplace plugin, which runs from its folder, by its one enabled id', async ($, on) => {
    const w = settingsWorld(on, { listed: () => JSON.stringify([{ id: 'gpt@gpt-subagents', installPath: '/cache/gpt/0.3.0', enabled: true }, { id: 'gpt@old', installPath: '/cache/old', enabled: false }]) })
    await start($)
    await gpt($, 'settings effort low')
    expect(w.runs[1]?.argv).toEqual(['/opt/claude', 'plugin', 'configure', 'gpt@gpt-subagents', '--values-stdin'])
  })

  test('/gpt settings configures a --plugin-dir plugin as gpt@inline, and reports a failed configure', async ($, on) => {
    const w = settingsWorld(on, { configureExit: 1 })
    await start($)
    const text = (await gpt($, 'settings web off')).text
    expect(w.runs[1]?.argv.slice(0, 2)).toEqual(['/opt/claude', '--plugin-dir'])
    expect(w.runs[1]?.argv.slice(3)).toEqual(['plugin', 'configure', 'gpt@inline', '--values-stdin'])
    expect(w.runs[1]?.stdin).toBe('{"web":"false"}')
    expect(text).toBe('web was not saved: claude plugin configure exited 1: Plugin not found')
  })

  test('a tiny nonzero cost never reads as zero', () => {
    expect([money(0), money(0.0000446), money(0.0042), money(0.042)]).toEqual(['$0.00', '<$0.0001', '$0.0042', '$0.04'])
  })

  test("Claude's own call to a bridge run tool is denied", async ($, on) => {
    world(on, 'gpt:sol', [])
    await start($)
    // Cast: an MCP tool name not in this build's generated types is too deep for the checker.
    const call = $.tool.call as unknown as (input: object) => Promise<{ deny?: string }>
    const r = await call({ tool: 'mcp__plugin_gpt_bridge__turn', tool_use_id: 'toolu_x', model: 'gpt-6.1-sol', input: 'hi' })
    expect(r.deny).toContain('dispatch Agent(subagent_type: "gpt:sol")')
    const page = await call({ tool: 'mcp__plugin_gpt_bridge__result', tool_use_id: 'toolu_y', id: 'resp_x', page: 0 })
    expect(page.deny).toContain('dispatch Agent(subagent_type: "gpt:sol")')
  })
})
