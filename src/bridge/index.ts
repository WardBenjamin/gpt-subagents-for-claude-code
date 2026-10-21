// gpt plugin's bridge: a stdio MCP server that runs GPT turns on the OpenAI Responses API.
import { createInterface } from 'node:readline'
import pkg from '../package.json' with { type: 'json' }
import { getKey as defaultGetKey } from './key.ts'
import { cancelTurn, getTurn, modelAvailable, redact, startTurn, waitTurn, type Ctx, type Turn } from './responses.ts'

export const DEFAULT_WAIT_MS = 45_000
/** A turn nobody has polled for this long is cancelled at OpenAI (its caller was stopped). */
export const ABANDON_MS = 60_000
/**
 * Claude Code swaps a tool result over its MCP output cap (MAX_MCP_OUTPUT_TOKENS, which the bridge inherits;
 * 25K tokens by default) for a note that is not an error, so a finished turn longer than one page comes as
 * { id, status, pages, length }, read with `result`. A token is at least one byte, so a page of 90% of the cap
 * in UTF-8 bytes always fits, whatever the script.
 */
// ponytail: a cap Claude Code sets remotely instead of through the variable is unseen; the hook's length check catches the swap.
export function pageBytes(cap = Number(process.env.MAX_MCP_OUTPUT_TOKENS)): number {
  return Math.max(4, Math.floor((cap > 0 ? cap : 25_000) * 0.9))
}

/** `json` cut into pages of at most `bytes` UTF-8 bytes each, never inside a character. */
export function paginate(json: string, bytes: number): string[] {
  const utf8 = new TextEncoder().encode(json)
  const pages: string[] = []
  for (let start = 0; start < utf8.length; ) {
    let end = Math.min(start + bytes, utf8.length)
    while (end < utf8.length && (utf8[end]! & 0xc0) === 0x80) end-- // a continuation byte: back up to the character's start
    pages.push(new TextDecoder().decode(utf8.subarray(start, end)))
    start = end
  }
  return pages
}
const HEALTH_MODEL = 'gpt-6.1-sol'
/** MCP protocol versions the bridge speaks, newest first. It offers only tools, which none of these changed. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const waitMs = { type: 'number', description: `Longest this call waits before returning in_progress (default ${DEFAULT_WAIT_MS}).` }
const id = { type: 'string', description: 'Response id from turn.' }
const TOOLS = [
  {
    name: 'turn',
    description: 'Start a GPT turn (background Responses API call) and wait up to wait_ms for it to finish.',
    inputSchema: {
      type: 'object',
      required: ['model', 'input'],
      properties: {
        model: { type: 'string' },
        input: { description: 'The prompt (string) on the first step, else function_call_output items.' },
        effort: { type: 'string', enum: EFFORTS },
        instructions: { type: 'string' },
        previous_response_id: { type: 'string' },
        tools: { type: 'array', description: 'OpenAI function tool definitions.' },
        max_output_tokens: { type: 'number' },
        wait_ms: waitMs,
      },
    },
  },
  {
    name: 'wait',
    description: 'Keep waiting on a turn started with turn; same result shape.',
    inputSchema: { type: 'object', required: ['id'], properties: { id, wait_ms: waitMs } },
  },
  {
    name: 'result',
    description: 'A finished turn too long for one reply comes from turn or wait as { id, status, pages }. ' +
      'This returns one page of it, read again from OpenAI each time; the pages joined in order are the turn as JSON.',
    inputSchema: { type: 'object', required: ['id', 'page'], properties: { id, page: { type: 'number', description: 'Page number, from 0.' } } },
  },
  { name: 'cancel', description: 'Cancel a running turn.', inputSchema: { type: 'object', required: ['id'], properties: { id } } },
  { name: 'health', description: 'Bridge version, whether an OpenAI key is found, and model access.', inputSchema: { type: 'object', properties: {} } },
]

type Args = Record<string, unknown>
const text = (value: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError })
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })

function check(a: Args, required: string[], strings: string[], numbers: string[]): string | undefined {
  for (const k of required) if (a[k] === undefined) return `missing ${k}`
  for (const k of strings) if (a[k] !== undefined && typeof a[k] !== 'string') return `${k} must be a string`
  for (const k of numbers) if (a[k] !== undefined && !(typeof a[k] === 'number' && a[k] > 0)) return `${k} must be a positive number`
  if (a.effort !== undefined && !EFFORTS.includes(a.effort as string)) return `effort must be one of ${EFFORTS.join(', ')}`
  if (a.tools !== undefined && !Array.isArray(a.tools)) return 'tools must be an array'
}

export function createServer(deps: Omit<Ctx, 'key' | 'signal'> & { getKey?: () => Promise<string>; abandonMs?: number; page?: number }) {
  const { getKey: readKey = () => defaultGetKey(), abandonMs = ABANDON_MS, page = pageBytes(), ...base } = deps
  const keys = new Set<string>() // every key handed out, so the one exit below can strip it
  const getKey = async () => { const k = await readKey(); keys.add(k); return k }

  // Watchdog: each in-progress turn must be polled again within abandonMs, or it is cancelled.
  const watched = new Map<string, ReturnType<typeof setTimeout>>()
  const unwatch = (id: string) => (clearTimeout(watched.get(id)), watched.delete(id))
  const watch = <T extends { id: string; status: string }>(key: string, turn: T): T => {
    unwatch(turn.id)
    if (turn.status !== 'in_progress') return turn
    const timer = setTimeout(() => (watched.delete(turn.id), cancelTurn({ ...base, key }, turn.id).catch(() => undefined)), abandonMs)
    timer.unref?.()
    watched.set(turn.id, timer)
    return turn
  }

  // A turn as the JSON that is paged, redacted before it is cut so no key straddles two pages.
  const json = (turn: Turn) => redact(JSON.stringify(turn), keys)
  const reply = (turn: Turn) => {
    const whole = json(turn)
    const pages = paginate(whole, page).length
    return pages > 1 ? text({ id: turn.id, status: turn.status, pages, length: whole.length }) : text(turn)
  }

  async function callTool(req: { name: string; arguments?: Args }, signal: AbortSignal) {
    const a: Args = req.arguments ?? {}
    const wait = (a.wait_ms as number | undefined) ?? DEFAULT_WAIT_MS
    try {
      if (req.name === 'health') {
        let key: string
        try {
          key = await getKey()
        } catch (e) {
          return text({ version: pkg.version, key: 'missing', message: (e as Error).message }, true)
        }
        const m = await modelAvailable({ ...base, key }, HEALTH_MODEL)
        return text({ version: pkg.version, key: 'found', model: m.available ? 'available' : 'not available', ...(m.message && { message: m.message }) })
      }
      const ctx: Ctx = { ...base, key: await getKey(), signal }
      switch (req.name) {
        case 'turn': {
          const bad = check(a, ['model', 'input'], ['model', 'instructions', 'previous_response_id', 'effort'], ['max_output_tokens', 'wait_ms'])
          return bad ? fail(bad) : reply(watch(ctx.key, await startTurn(ctx, a as any, wait)))
        }
        case 'wait': {
          const bad = check(a, ['id'], ['id'], ['wait_ms'])
          if (bad) return fail(bad)
          const id = a.id as string
          unwatch(id)
          // A failed poll leaves the turn running at OpenAI: keep it under the watchdog.
          return reply(watch(ctx.key, await waitTurn(ctx, id, wait).catch(e => { watch(ctx.key, { id, status: 'in_progress' }); throw e })))
        }
        case 'result': {
          const bad = check(a, ['id', 'page'], ['id'], [])
          if (bad) return fail(bad)
          const n = a.page as number
          if (!Number.isInteger(n) || n < 0) return fail('page must be a whole number from 0')
          // Stateless: a stored response no longer changes once finished, so every read pages the same JSON.
          const turn = await getTurn(ctx, a.id as string)
          if (turn.status === 'in_progress') return fail(`turn ${turn.id} has not finished`)
          const pages = paginate(json(turn), page)
          if (n >= pages.length) return fail('page out of range')
          return { content: [{ type: 'text' as const, text: pages[n]! }], isError: false }
        }
        case 'cancel': {
          const bad = check(a, ['id'], ['id'], [])
          if (bad) return fail(bad)
          unwatch(a.id as string)
          return text(await cancelTurn(ctx, a.id as string))
        }
        default:
          return fail(`unknown tool ${req.name}`)
      }
    } catch (e) {
      return fail((e as Error).message)
    }
  }
  // MCP over JSON-RPC 2.0: the handshake, tools, ping, and cancellation of a running call.
  async function handle(msg: Rpc, calls: Map<unknown, AbortController>): Promise<unknown> {
    const p = (msg.params ?? {}) as Args
    switch (msg.method) {
      case 'initialize': {
        const asked = p.protocolVersion as string
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'bridge', version: pkg.version },
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return { tools: TOOLS }
      case 'tools/call': {
        const abort = new AbortController()
        calls.set(msg.id, abort)
        try {
          const r = await callTool(p as { name: string; arguments?: Args }, abort.signal)
          // The bridge's one exit: no key or masked fragment of one leaves it, whichever error or reply carries it.
          for (const c of r.content) c.text = redact(c.text, keys)
          return abort.signal.aborted ? undefined : r
        } finally {
          calls.delete(msg.id)
        }
      }
    }
    throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 })
  }

  return {
    async connect(t: Transport) {
      const calls = new Map<unknown, AbortController>()
      t.onmessage = async msg => {
        if (msg.id === undefined) {
          if (msg.method === 'notifications/cancelled') calls.get((msg.params as Args)?.requestId)?.abort()
          return
        }
        if (!msg.method) return // a response: the bridge sends no requests
        try {
          const result = await handle(msg, calls)
          if (result !== undefined) await t.send({ jsonrpc: '2.0', id: msg.id, result })
        } catch (e) {
          await t.send({ jsonrpc: '2.0', id: msg.id, error: { code: (e as { code?: number }).code ?? -32603, message: (e as Error).message } })
        }
      }
      await t.start()
    },
  }
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: unknown; result?: unknown; error?: unknown }
/** The MCP SDK's Transport shape, so tests can connect the SDK's client in memory. */
type Transport = { onmessage?: (msg: Rpc) => void; send(msg: Rpc): Promise<void>; start(): Promise<void> }

/** MCP's stdio transport: one JSON-RPC message per line. */
export function stdio(input = process.stdin, output = process.stdout): Transport {
  const t: Transport = {
    send: async msg => void output.write(JSON.stringify(msg) + '\n'),
    start: async () => {
      createInterface({ input }).on('line', line => {
        if (!line.trim()) return
        let msg: Rpc
        try {
          msg = JSON.parse(line)
        } catch {
          return void t.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        }
        t.onmessage?.(msg)
      })
    },
  }
  return t
}

if (import.meta.main) await createServer({ fetch }).connect(stdio())
