import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cancelTurn, costUsd, startTurn, toTurn, waitTurn } from './responses.ts'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fakeCtx, fixture, type Reply } from './testing.ts'

test('completed turn: text joined, reasoning ignored, cost priced from a dated model id', () => {
  const t = toTurn(fixture('completed-text'))
  assert.equal(t.status, 'completed')
  assert.equal(t.text, 'Hello, Ben.')
  assert.deepEqual(t.calls, [])
  assert.deepEqual(t.usage, { input: 1_000_000, cached: 400_000, cacheWrite: 0, output: 100_000 })
  // >272K prompt: ((600K*$2 + 400K*$0.10) * 2 + 100K*$10 * 1.5) / 1M
  assert.equal(t.costUsd, (1.2 + 0.04) * 2 + 1 * 1.5)
})

test('function calls keep order; bad JSON args become args:null + argsError', () => {
  const t = toTurn(fixture('function-calls'))
  assert.equal(t.text, '')
  assert.deepEqual(t.calls, [
    { call_id: 'call_a', name: 'Read', args: { file_path: '/tmp/a.txt' } },
    { call_id: 'call_b', name: 'Bash', args: null, argsError: '{"command": "ls' },
  ])
})

test('incomplete turn carries the reason and partial text', () => {
  const t = toTurn(fixture('incomplete'))
  assert.equal(t.status, 'incomplete')
  assert.equal(t.reason, 'max_output_tokens')
  assert.equal(t.text, 'Partial')
})

test('live fixtures (gpt-6.1-sol, 2026-10-19): queued and in_progress read as in_progress', () => {
  for (const name of ['live-queued', 'live-in-progress']) assert.equal(toTurn(fixture(name)).status, 'in_progress')
})

test('live fixture: function call parsed, priced at $2/$10 per M', () => {
  const t = toTurn(fixture('live-function-call'))
  assert.deepEqual(t.calls, [{ call_id: 'call_l2TcQe0FCjMMsrvb8Zxv3l5s', name: 'Read', args: { file_path: '/tmp/gpt-bridge-probe.txt' } }])
  assert.deepEqual(t.usage, { input: 87, cached: 0, cacheWrite: 0, output: 26 })
  assert.equal(t.costUsd, (87 * 2 + 26 * 10) / 1e6)
})

test('live fixture: final message text', () => {
  const t = toTurn(fixture('live-final-text'))
  assert.deepEqual([t.status, t.text, t.calls], ['completed', 'bridge probe OK', []])
})

test('unknown model prices as null', () => {
  assert.equal(costUsd('gpt-6-sol', { input: 1, cached: 0, output: 1 }), null)
})

test('each model is priced per million tokens, cache writes included', () => {
  const u = { input: 1_000_000, cached: 200_000, cacheWrite: 100_000, output: 100_000 }
  // under the surcharge threshold? no: 1M > 272K, so input rates x2 and output x1.5
  const at = (i: number, c: number, w: number, o: number) => ((700_000 * i + 200_000 * c + 100_000 * w) * 2 + 100_000 * o * 1.5) / 1e6
  assert.equal(costUsd('gpt-6.1-sol', u), at(2, 0.1, 2.5, 10))
  assert.equal(costUsd('gpt-6-astra-2026-09-01', u), at(10, 1, 12.5, 50))
  assert.equal(costUsd('gpt-6-luna', u), at(0.1, 0.01, 0.1, 0.5))
  const small = { input: 1000, cached: 0, output: 1000 }
  assert.equal(costUsd('gpt-6.1-sol', small), (1000 * 2 + 1000 * 10) / 1e6) // no surcharge under 272K
})

test('web actions are listed with sources; only searches cost $0.01; citations become a Sources list', () => {
  const t = toTurn({
    id: 'resp_web', status: 'completed', model: 'gpt-6-luna',
    output: [
      { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'claude code mods', sources: [{ type: 'url', url: 'https://example.com/a' }, { type: 'url', url: 'https://example.com/b' }] } },
      { type: 'web_search_call', id: 'ws_2', status: 'completed', action: { type: 'open_page', url: 'https://example.com/a' } },
      { type: 'web_search_call', id: 'ws_3', status: 'completed', action: { type: 'find_in_page', url: 'https://example.com/a', pattern: '2.1.287' } },
      { type: 'message', content: [{ type: 'output_text', text: 'Mods shipped in 2.1.287.', annotations: [
        { type: 'url_citation', url: 'https://example.com/a', title: 'Changelog', start_index: 0, end_index: 5 },
        { type: 'url_citation', url: 'https://example.com/a', title: 'Changelog', start_index: 6, end_index: 9 },
      ] }] },
    ],
    usage: { input_tokens: 0, output_tokens: 0 },
  })
  assert.deepEqual(t.webActions, [
    { type: 'search', query: 'claude code mods', url: undefined, sources: ['https://example.com/a', 'https://example.com/b'] },
    { type: 'open_page', query: undefined, url: 'https://example.com/a' },
    { type: 'find_in_page', query: '2.1.287', url: 'https://example.com/a' },
  ])
  assert.deepEqual(t.citations, ['https://example.com/a'])
  assert.equal(t.costUsd, 0.01) // one search; the page actions cost only their tokens
  assert.equal(t.text, 'Mods shipped in 2.1.287.\n\nSources:\n- [Changelog](https://example.com/a)')
})

test('startTurn sends a background, stored request with effort and auth', async () => {
  const { ctx, seen } = fakeCtx([[200, fixture('completed-text')]])
  await startTurn(ctx, { model: 'gpt-6.1-sol', input: 'hi', effort: 'xhigh' }, 45_000)
  const body = JSON.parse(String(seen[0]!.init.body))
  assert.equal(seen[0]!.url, 'https://api.openai.com/v1/responses')
  assert.deepEqual([body.background, body.store, body.reasoning], [true, true, { effort: 'xhigh' }])
  assert.equal((seen[0]!.init.headers as Record<string, string>).Authorization, 'Bearer sk-test-secret')
  assert.equal(body.include, undefined)
})

test('a request with web_search asks OpenAI for each search\'s sources', async () => {
  const { ctx, seen } = fakeCtx([[200, fixture('completed-text')]])
  await startTurn(ctx, { model: 'gpt-6.1-sol', input: 'hi', tools: [{ type: 'web_search', external_web_access: false }] }, 45_000)
  assert.deepEqual(JSON.parse(String(seen[0]!.init.body)).include, ['web_search_call.action.sources'])
})

test('429 then success: caller sees only the result', async () => {
  const { ctx } = fakeCtx([[429, { error: { message: 'slow down' } }], [200, fixture('completed-text')]])
  assert.equal((await startTurn(ctx, { model: 'gpt-6.1-sol', input: 'hi' }, 45_000)).status, 'completed')
})

test('400 throws naming the status and OpenAI message, never the key', async () => {
  const { ctx } = fakeCtx([[400, { error: { message: "The model 'nope' does not exist" } }]])
  await assert.rejects(startTurn(ctx, { model: 'nope', input: 'hi' }, 45_000), (e: Error) => {
    assert.equal(e.message, "OpenAI 400: The model 'nope' does not exist")
    assert.ok(!e.message.includes('sk-test-secret'))
    return true
  })
})

test('long-poll returns in_progress at the deadline, completed on a later wait', async () => {
  const slow = fixture('in-progress')
  const { ctx, elapsed, seen } = fakeCtx(Array.from({ length: 20 }, () => [200, slow] as [number, unknown]))
  const first = await startTurn(ctx, { model: 'gpt-6.1-sol', input: 'hi' }, 45_000)
  assert.deepEqual(first, { id: 'resp_slow', status: 'in_progress' })
  assert.equal(elapsed(), 45_000) // never sleeps past the deadline
  assert.equal(seen.length, 13) // the create and 12 polls, none once the deadline is reached

  const done = fakeCtx([[200, slow], [200, { ...fixture('completed-text'), id: 'resp_slow' }]])
  const second = await waitTurn(done.ctx, 'resp_slow', 45_000)
  assert.equal(second.status, 'completed')
  assert.equal(done.elapsed(), 1000) // first backoff step
})

test('a cancelled MCP request stops the poll and cancels the response at OpenAI', async () => {
  const ac = new AbortController()
  const { ctx, seen } = fakeCtx([[200, fixture('in-progress')], [200, { id: 'resp_slow', status: 'cancelled' }]])
  const realFetch = ctx.fetch
  ctx.fetch = (async (url: string, init: RequestInit) => { const r = await realFetch(url, init); ac.abort(); return r }) as typeof fetch
  const t = await waitTurn({ ...ctx, signal: ac.signal }, 'resp_slow', 45_000)
  assert.deepEqual(t, { id: 'resp_slow', status: 'cancelled' })
  assert.equal(seen.at(-1)!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')
})

test('live fixture (gpt-6-luna + web_search, 2026-10-19): open_page action, Sources list, cache writes priced', () => {
  const t = toTurn(fixture('live-web-search'))
  assert.deepEqual(t.webActions?.map(a => a.type), ['open_page'])
  assert.match(t.text ?? '', /\n\nSources:\n- \[Anthropic published an AI-native SDLC playbook/)
  assert.equal(t.usage?.cacheWrite, 4488)
  assert.ok(t.costUsd! > 0 && t.costUsd! < 0.002) // OpenAI counts 0 web_search requests: tokens only
})

test('live fixture (gpt-6.1-sol, 2026-10-22): search with sources, open_page, find_in_page; one billed search', () => {
  const t = toTurn(fixture('live-web-sources'))
  assert.deepEqual(t.webActions?.map(a => [a.type, a.query ?? a.url]), [
    ['search', 'site:nodejs.org/en/blog/release "Node.js v26"'],
    ['open_page', 'https://nodejs.org/en/blog/release'],
    ['find_in_page', 'Notable Changes'],
  ])
  assert.equal(t.webActions?.[0]?.sources?.length, 12)
  assert.deepEqual(t.citations, ['https://nodejs.org/en/blog/release', 'https://nodejs.org/en/blog/release/v26.12.1'])
  const tokens = costUsd('gpt-6.1-sol', t.usage!)!
  assert.ok(Math.abs(t.costUsd! - tokens - 0.01) < 1e-9) // tool_usage.web_search.num_requests is 1
})

test('cancel posts to the cancel endpoint and returns the reported status', async () => {
  const { ctx, seen } = fakeCtx([[200, { id: 'resp_slow', status: 'cancelled' }]])
  assert.deepEqual(await cancelTurn(ctx, 'resp_slow'), { id: 'resp_slow', status: 'cancelled' })
  assert.equal(seen[0]!.url, 'https://api.openai.com/v1/responses/resp_slow/cancel')
})

const hang: Reply = (_url, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))

test('a poll that never answers ends at the deadline as in_progress', async () => {
  const { ctx } = fakeCtx([hang])
  const t0 = Date.now()
  assert.deepEqual(await waitTurn({ ...ctx, now: Date.now }, 'resp_slow', 100), { id: 'resp_slow', status: 'in_progress' })
  assert.ok(Date.now() - t0 < 1000)
})

test('a response body that never ends is cut off at the deadline too', { timeout: 5000 }, async () => {
  const server = createServer((_req, res) => (res.writeHead(200, { 'Content-Type': 'application/json' }), res.write('{')))
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const ctx = { key: 'k', fetch: ((url: string, init: RequestInit) => fetch(url.replace('https://api.openai.com', local), init)) as typeof fetch }
  try {
    assert.deepEqual(await waitTurn(ctx, 'resp_slow', 200), { id: 'resp_slow', status: 'in_progress' })
  } finally {
    server.closeAllConnections()
    server.close()
  }
})

test('an already-cancelled request creates nothing', async () => {
  const ac = new AbortController()
  ac.abort()
  const { ctx, seen } = fakeCtx([])
  await assert.rejects(startTurn({ ...ctx, signal: ac.signal }, { model: 'gpt-6.1-sol', input: 'hi' }, 45_000))
  assert.equal(seen.length, 0)
})

test('a cancel during retry backoff cancels at OpenAI instead of retrying', async () => {
  const ac = new AbortController()
  const { ctx, seen } = fakeCtx([[503, { error: { message: 'busy' } }], [200, { id: 'resp_slow', status: 'cancelled' }]])
  const t = await waitTurn({ ...ctx, signal: ac.signal, sleep: async () => ac.abort() }, 'resp_slow', 45_000)
  assert.equal(t.status, 'cancelled')
  assert.deepEqual(seen.map(s => s.url.slice(25)), ['/responses/resp_slow?include%5B%5D=web_search_call.action.sources', '/responses/resp_slow/cancel'])
})

test('a create that uses up the wait returns in_progress without polling', async () => {
  const { ctx, seen, tick } = fakeCtx([async () => (tick(45_000), new Response(JSON.stringify(fixture('in-progress'))))])
  assert.deepEqual(await startTurn(ctx, { model: 'gpt-6.1-sol', input: 'hi' }, 45_000), { id: 'resp_slow', status: 'in_progress' })
  assert.equal(seen.length, 1)
})

test('a create that may have reached OpenAI is reported, never replayed: it has no idempotency key', async () => {
  const replies: Array<[string, Reply, number]> = [
    ['500', [500, { error: { message: 'server error' } }], 45_000],
    ['dropped connection', async () => { throw new TypeError('fetch failed') }, 45_000],
    ['no answer by the deadline', hang, 100],
  ]
  for (const [name, reply, waitMs] of replies) {
    const { ctx, seen } = fakeCtx([reply])
    await assert.rejects(startTurn({ ...ctx, now: Date.now }, { model: 'gpt-6.1-sol', input: 'hi' }, waitMs), /OpenAI may have started the response/, name)
    assert.equal(seen.length, 1, name)
  }
})

test('live fixture (gpt-6.1-sol, 47 pages, 2026-10-22): 5 open_page actions return 8, 8, 8, 10 and 13 pages, without their text', () => {
  const t = toTurn(fixture('live-web-pages'))
  assert.deepEqual(t.webActions?.map(a => [a.type, a.pages?.length]), [['open_page', 8], ['open_page', 8], ['open_page', 8], ['open_page', 10], ['open_page', 13]])
  assert.equal(new Set(t.webActions?.flatMap(a => a.pages ?? [])).size, 47)
  assert.ok(t.webActions?.[4]?.pages?.includes('https://nodejs.org/en/blog/release/v26.0.0'))
  assert.equal(t.notices, undefined)
  assert.ok(!JSON.stringify(t).includes('trimmed for the fixture'))
})

test('the web tool\'s other results and a web action that didn\'t complete become notices', () => {
  const t = toTurn({
    id: 'resp_n', status: 'completed', model: 'gpt-6.1-sol', usage: { input_tokens: 0, output_tokens: 0 },
    output: [{ type: 'web_search_call', id: 'ws_1', status: 'failed', action: { type: 'open_page', url: 'https://a.example' }, results: [
      { type: 'text_result', url: 'https://a.example', title: 'A', snippet: 'page text' },
      { type: 'notice', text: 'Return token budget exhausted:\n no more pages this run.' },
    ] }],
  })
  assert.deepEqual(t.webActions?.[0]?.pages, ['https://a.example'])
  assert.deepEqual(t.notices, ['Return token budget exhausted: no more pages this run.', 'open page failed'])
})

test('a finished web turn is read once more with its results; polls of a running one are not', async () => {
  const done = fixture('live-web-pages')
  const bare = { ...done, output: done.output.map((o: any) => { const { results, ...rest } = o; return rest }) }
  const { ctx, seen } = fakeCtx([[200, { id: done.id, status: 'in_progress' }], [200, bare], [200, done]])
  const t = await waitTurn(ctx, done.id, 45_000)
  assert.deepEqual(seen.map(s => s.url.includes('web_search_call.results')), [false, false, true])
  assert.equal(t.webActions?.[0]?.pages?.length, 8)
})
