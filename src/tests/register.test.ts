import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import { money } from '../hooks/gpt-command'
import type { Engine } from 'claude-code/testing'

tier('user')

type Turn = Record<string, unknown>

/** The world beneath the mod: one subagent of `type`, its transcript, and a bridge answering `turns` in order. */
function world(on: On, type: string, turns: Array<Turn | Error>, offersHandback = true, autoModeServer?: string) {
  const bridgeCalls: Array<{ tool: string; args: Record<string, unknown> }> = []
  let nextCalled = false
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('agent.register', ($, e) => ({ value: { agent: `gpt:${e.name}` } }))
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
    return { value: { content: [{ type: 'text', text: JSON.stringify(t) }], isError: false } }
  })
  on('turn.step', async function* (_$, e) {
    nextCalled = true
    yield { kind: 'text' as const, index: 0, text: 'claude answer' }
    return { turnId: e.turnId, index: e.index, answer: 'claude answer', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  return { bridgeCalls, agents, nextCalled: () => nextCalled }
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
  })
})
