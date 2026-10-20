import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from './index.ts'
import { NO_KEY } from './key.ts'
import { fakeCtx, fixture, type Reply } from './testing.ts'

async function connect(replies: Reply[], getKey = async () => 'sk-test-secret', abandonMs?: number) {
  const { ctx, seen } = fakeCtx(replies)
  const { key: _, ...base } = ctx
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createServer({ ...base, getKey, abandonMs }).connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> }
    return { isError: r.isError ?? false, text: r.content[0]!.text }
  }
  return { client, call, seen }
}

test('lists the four tools', async () => {
  const { client } = await connect([])
  assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['turn', 'wait', 'cancel', 'health'])
})

test('turn → wait → completed, then cancel', async () => {
  const { call } = await connect([
    ...Array.from({ length: 20 }, () => [200, fixture('in-progress')] as [number, unknown]),
    [200, { ...fixture('function-calls'), id: 'resp_slow' }],
    [200, { id: 'resp_slow', status: 'cancelled' }],
  ])
  const first = await call('turn', { model: 'gpt-6.1-sol', input: 'hi', effort: 'xhigh', wait_ms: 45_000 })
  assert.deepEqual(JSON.parse(first.text), { id: 'resp_slow', status: 'in_progress' })
  const done = JSON.parse((await call('wait', { id: 'resp_slow' })).text)
  assert.equal(done.status, 'completed')
  assert.equal(done.calls.length, 2)
  assert.deepEqual(JSON.parse((await call('cancel', { id: 'resp_slow' })).text), { id: 'resp_slow', status: 'cancelled' })
})

test('replays the recorded live turn: queued → in_progress → function call', async () => {
  const { call } = await connect([
    [200, fixture('live-queued')],
    [200, fixture('live-in-progress')],
    [200, fixture('live-function-call')],
  ])
  const t = JSON.parse((await call('turn', { model: 'gpt-6.1-sol', input: 'hi', effort: 'low' })).text)
  assert.equal(t.status, 'completed')
  assert.equal(t.calls[0].name, 'Read')
})

test('a turn left unpolled past abandonMs is cancelled at OpenAI', async () => {
  const { call, seen } = await connect([
    ...Array.from({ length: 20 }, () => [200, fixture('in-progress')] as [number, unknown]),
    [200, { id: 'resp_slow', status: 'cancelled' }],
  ], undefined, 30)
  assert.equal(JSON.parse((await call('turn', { model: 'gpt-6.1-sol', input: 'hi', wait_ms: 5000 })).text).status, 'in_progress')
  await new Promise(r => setTimeout(r, 80))
  assert.equal(seen.at(-1)!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')
})

test('OpenAI 400 becomes an MCP tool error naming status and message', async () => {
  const { call } = await connect([[400, { error: { message: "The model 'nope' does not exist" } }]])
  assert.deepEqual(await call('turn', { model: 'nope', input: 'hi' }), { isError: true, text: "OpenAI 400: The model 'nope' does not exist" })
})

test('bad arguments are refused before any request', async () => {
  const { call, seen } = await connect([])
  assert.equal((await call('turn', { input: 'hi' })).text, 'missing model')
  assert.equal((await call('turn', { model: 'gpt-6.1-sol', input: 'hi', effort: 'ultra' })).isError, true)
  assert.equal(seen.length, 0)
})

test('no key: every tool errors with NO_KEY and sends nothing', async () => {
  const { call, seen } = await connect([], async () => { throw new Error(NO_KEY) })
  assert.deepEqual(await call('turn', { model: 'gpt-6.1-sol', input: 'hi' }), { isError: true, text: NO_KEY })
  const health = await call('health')
  assert.equal(health.isError, true)
  assert.equal(JSON.parse(health.text).key, 'missing')
  assert.equal(seen.length, 0)
})

test('health: key found, model available or not, key never shown', async () => {
  const ok = await connect([[200, { id: 'gpt-6.1-sol', object: 'model' }]])
  const good = await ok.call('health')
  assert.equal(JSON.parse(good.text).model, 'available')
  assert.ok(!good.text.includes('sk-test-secret'))

  const missing = await connect([[404, { error: { message: "The model 'gpt-6.1-sol' does not exist" } }]])
  const bad = JSON.parse((await missing.call('health')).text)
  assert.deepEqual([bad.key, bad.model], ['found', 'not available'])
})

test('no key or masked fragment of one leaves the bridge, whatever path the error takes', async () => {
  const key = 'sk-test-secret'
  const cases: Array<[string, Reply]> = [
    ['rejected fetch', async () => { throw new Error(`request failed: Authorization: Bearer ${key}`) }],
    ['unparseable body', async () => new Response(`oops ${key} not json`, { status: 200 })],
    ['failed turn in a 200', [200, { id: 'resp_f', status: 'failed', model: 'gpt-6.1-sol', output: [], error: { message: `bad key ${key}` } }]],
    ['period-free masked fragment', [401, { error: { message: 'Incorrect API key provided: sk-test-****cret' } }]],
    ['masked fragment mid-line', [401, { error: { message: 'key sk-proj-********abcd\nrejected' } }]],
  ]
  for (const [name, reply] of cases) {
    const { text } = await (await connect([reply])).call('turn', { model: 'gpt-6.1-sol', input: 'hi' })
    assert.ok(!text.includes(key) && !text.includes('sk-te') && !/\*{3}/.test(text), `${name}: ${text}`)
    assert.match(text, /\[redacted\]|not JSON/, name)
  }
})

test('401 redacts the key fragment OpenAI echoes back', async () => {
  const echo = 'Incorrect API key provided: sk-test-********cret. You can find your API key at https://platform.openai.com/account/api-keys.'
  const { call } = await connect([[401, { error: { message: echo } }]])
  assert.deepEqual(await call('turn', { model: 'gpt-6.1-sol', input: 'hi' }), {
    isError: true,
    text: 'OpenAI 401: Incorrect API key provided: [redacted]. You can find your API key at https://platform.openai.com/account/api-keys.',
  })
})

test('a failed poll leaves the turn under the watchdog, which cancels it once unpolled', async () => {
  const slow = (n: number) => Array.from({ length: n }, () => [200, fixture('in-progress')] as Reply)
  const failed: Reply = [400, { error: { message: 'bad request' } }]
  const cancelled: Reply = [200, { id: 'resp_slow', status: 'cancelled' }]

  const viaWait = await connect([...slow(5), failed, cancelled], undefined, 50)
  assert.equal(JSON.parse((await viaWait.call('turn', { model: 'gpt-6.1-sol', input: 'hi', wait_ms: 5000 })).text).status, 'in_progress')
  assert.equal((await viaWait.call('wait', { id: 'resp_slow' })).isError, true)
  await new Promise(r => setTimeout(r, 150))
  assert.equal(viaWait.seen.at(-1)!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')

  // A failed first poll inside turn: the id is not lost, so turn reports in_progress and arms the watchdog.
  const viaTurn = await connect([...slow(1), failed, cancelled], undefined, 50)
  assert.deepEqual(JSON.parse((await viaTurn.call('turn', { model: 'gpt-6.1-sol', input: 'hi' })).text), { id: 'resp_slow', status: 'in_progress' })
  await new Promise(r => setTimeout(r, 150))
  assert.equal(viaTurn.seen.at(-1)!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')
})

test('a wait the client cancels stops polling and cancels the response at OpenAI', async () => {
  const hang: Reply = (_url, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
  const { client, seen } = await connect([hang, [200, { id: 'resp_slow', status: 'cancelled' }]])
  const abort = new AbortController()
  const pending = client.callTool({ name: 'wait', arguments: { id: 'resp_slow' } }, undefined, { signal: abort.signal })
  while (!seen.length) await new Promise(r => setImmediate(r))
  abort.abort()
  await assert.rejects(pending)
  while (seen.length < 2) await new Promise(r => setImmediate(r))
  assert.equal(seen[1]!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')
})

test('over stdio with no node_modules: handshake, tools, ping, and JSON-RPC errors', async () => {
  const { spawn } = await import('node:child_process')
  const { createInterface } = await import('node:readline')
  const p = spawn(process.execPath, [new URL('index.ts', import.meta.url).pathname], { env: { PATH: process.env.PATH } })
  const lines = createInterface({ input: p.stdout })[Symbol.asyncIterator]()
  const ask = async (msg: string) => (p.stdin.write(msg + '\n'), JSON.parse((await lines.next()).value))
  const init = await ask(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }))
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.equal(init.result.serverInfo.name, 'bridge')
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  assert.equal((await ask(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))).result.tools.length, 4)
  assert.deepEqual((await ask(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }))).result, {})
  assert.equal((await ask(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/list' }))).error.code, -32601)
  assert.equal((await ask('{not json')).error.code, -32700)
  p.kill()
})
