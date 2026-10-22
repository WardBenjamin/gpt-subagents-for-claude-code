// OpenAI Responses API client for the bridge: background create, long-poll, cancel.

export type Ctx = {
  fetch: typeof fetch
  key: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  /** Aborted when the MCP request is cancelled: the poll stops and the response is cancelled at OpenAI. */
  signal?: AbortSignal
}

export type Call = { call_id: string; name: string; args: unknown; argsError?: string }
export type Usage = { input: number; cached: number; cacheWrite?: number; output: number }
/** One web action at OpenAI: `query` is a search's query or a find-in-page pattern; `sources` are the URLs a search consulted. */
export type WebAction = { type: string; query?: string; url?: string; sources?: string[] }
export type Turn = {
  id: string
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'incomplete'
  text?: string
  calls?: Call[]
  webActions?: WebAction[]
  /** The URLs GPT's text cites (`url_citation`), each once. */
  citations?: string[]
  usage?: Usage
  costUsd?: number | null
  reason?: string
}
export type TurnArgs = {
  model: string
  input: unknown
  effort?: string
  instructions?: string
  previous_response_id?: string
  tools?: unknown[]
  max_output_tokens?: number
}

export class OpenAIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(`OpenAI ${status}: ${message}`)
    this.status = status
  }
}

const BASE = 'https://api.openai.com/v1'
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete'])
// $ per million tokens (OpenAI model pages, 2026-10-19); matched by prefix so dated snapshots price too.
const PRICES: Record<string, { input: number; cached: number; cacheWrite: number; output: number }> = {
  'gpt-6.1-sol': { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 },
  'gpt-6-astra': { input: 10, cached: 1, cacheWrite: 12.5, output: 50 },
  // ponytail: luna lists no cache-write rate; its input rate is assumed until OpenAI publishes one.
  'gpt-6-luna': { input: 0.1, cached: 0.01, cacheWrite: 0.1, output: 0.5 },
}
const LONG_PROMPT = 272_000
// A stored response's search sources come back only when asked for, on the create and on every read.
const SOURCES = 'web_search_call.action.sources'
const read = (id: string) => `/responses/${encodeURIComponent(id)}?include%5B%5D=${SOURCES}`
const WEB_SEARCH_USD = 10 / 1000 // per search action; opening or searching a page costs only its tokens (OpenAI, 2026-10-22)

const now = (ctx: Ctx) => (ctx.now ?? Date.now)()
const sleep = (ctx: Ctx, ms: number) =>
  (ctx.sleep ?? (m => new Promise<void>(r => {
    const t = setTimeout(r, m)
    ctx.signal?.addEventListener('abort', () => (clearTimeout(t), r()), { once: true })
  })))(ms)

/** Priced cost of a turn. Over 272K input tokens every input rate doubles and output is 1.5x (OpenAI). */
export function costUsd(model: string, u: Usage, searches = 0): number | null {
  const p = Object.entries(PRICES).find(([k]) => model.startsWith(k))?.[1]
  if (!p) return null
  const written = u.cacheWrite ?? 0
  // ponytail: assumes input_tokens includes cached and cache-written tokens, as it does cached ones.
  const fresh = Math.max(0, u.input - u.cached - written)
  const [inX, outX] = u.input > LONG_PROMPT ? [2, 1.5] : [1, 1]
  const tokens = ((fresh * p.input + u.cached * p.cached + written * p.cacheWrite) * inX + u.output * p.output * outX) / 1e6
  return tokens + searches * WEB_SEARCH_USD
}

/**
 * One HTTP call, bounded by `deadline` and the caller's signal; retries 429 and 5xx with jittered backoff.
 * A create is not cut off by the signal (its id is needed to cancel it) and is not retried on 5xx.
 */
async function request(ctx: Ctx, method: string, path: string, body: unknown, deadline: number, create = false): Promise<any> {
  for (let delay = 500; ; delay *= 2) {
    ctx.signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(Math.max(0, deadline - now(ctx)))
    const res = await ctx.fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctx.signal && !create ? AbortSignal.any([ctx.signal, timeout]) : timeout,
    })
    // A JSON parse error quotes the start of the body; say only that it was not JSON.
    if (res.ok) return res.json().catch(e => { throw e?.name === 'SyntaxError' ? new OpenAIError(res.status, 'response body was not JSON') : e })
    const wait = delay * (0.5 + (ctx.random ?? Math.random)())
    if ((res.status === 429 || (res.status >= 500 && !create)) && now(ctx) + wait < deadline) {
      await sleep(ctx, wait)
      continue
    }
    throw new OpenAIError(res.status, String(((await res.json().catch(() => null)) as any)?.error?.message ?? res.statusText))
  }
}

/** Removes each key, and any masked fragment like the `sk-test-****cret` OpenAI echoes for a rejected key. */
export const redact = (s: string, keys: Iterable<string>) =>
  [...keys].reduce((out, k) => out.split(k).join('[redacted]'), s).replace(/[\w-]*\*{3,}[\w-]*/g, '[redacted]')

export function toTurn(r: any): Turn {
  if (!TERMINAL.has(r.status)) return { id: r.id, status: 'in_progress' }
  const output: any[] = r.output ?? []
  const parts = output.filter(o => o.type === 'message').flatMap(o => o.content ?? []).filter(c => c.type === 'output_text')
  // OpenAI requires web citations to stay visible: list each cited URL once under the text.
  const cites = new Map<string, string>()
  for (const a of parts.flatMap(c => c.annotations ?? [])) if (a.type === 'url_citation' && a.url) cites.set(a.url, a.title || a.url)
  const body = parts.map(c => c.text).join('')
  const text = cites.size ? `${body}\n\nSources:\n${[...cites].map(([url, title]) => `- [${title}](${url})`).join('\n')}` : body
  const webActions: WebAction[] = output
    .filter(o => o.type === 'web_search_call')
    .map(o => {
      const a = o.action ?? {}
      const sources: string[] = (a.sources ?? []).map((x: any) => (typeof x === 'string' ? x : x?.url)).filter(Boolean)
      return { type: a.type ?? 'search', query: a.query ?? a.queries?.[0] ?? a.pattern, url: a.url, ...(sources.length && { sources }) }
    })
  // OpenAI's own count of billed searches; else one per search action (page actions aren't billed).
  const searches = r.tool_usage?.web_search?.num_requests ?? webActions.filter(a => a.type === 'search').length
  const calls: Call[] = output
    .filter(o => o.type === 'function_call')
    .map(o => {
      try {
        return { call_id: o.call_id, name: o.name, args: JSON.parse(o.arguments) }
      } catch {
        return { call_id: o.call_id, name: o.name, args: null, argsError: o.arguments }
      }
    })
  const usage: Usage = {
    input: r.usage?.input_tokens ?? 0,
    cached: r.usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWrite: r.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    output: r.usage?.output_tokens ?? 0,
  }
  const reason = r.status === 'incomplete' ? r.incomplete_details?.reason : r.status === 'failed' ? r.error?.message : undefined
  return {
    id: r.id, status: r.status, text, calls, ...(webActions.length && { webActions }), ...(cites.size && { citations: [...cites.keys()] }),
    usage, costUsd: costUsd(r.model ?? '', usage, searches), ...(reason && { reason }),
  }
}

/** Long-polls a stored response until it is terminal or `waitMs` runs out. */
export async function waitTurn(ctx: Ctx, id: string, waitMs: number): Promise<Turn> {
  const deadline = now(ctx) + waitMs
  const cancel = async () => (await cancelTurn({ ...ctx, signal: undefined }, id)) as Turn
  for (let delay = 1000; ; delay = Math.min(delay * 1.5, 5000)) {
    if (ctx.signal?.aborted) return cancel()
    let turn: Turn
    try {
      turn = toTurn(await request(ctx, 'GET', read(id), undefined, deadline))
    } catch (e) {
      if (ctx.signal?.aborted) return cancel()
      if ((e as Error)?.name === 'TimeoutError') return { id, status: 'in_progress' } // the deadline cut the poll short
      throw e
    }
    const left = deadline - now(ctx)
    if (turn.status !== 'in_progress' || left <= 0) return turn
    await sleep(ctx, Math.min(delay, left))
    if (now(ctx) >= deadline && !ctx.signal?.aborted) return turn
  }
}

/** A stored response as a turn, read once. */
export async function getTurn(ctx: Ctx, id: string): Promise<Turn> {
  return toTurn(await request(ctx, 'GET', read(id), undefined, now(ctx) + 30_000))
}

/** Creates a background response, then waits on it for up to `waitMs` in total. */
export async function startTurn(ctx: Ctx, a: TurnArgs, waitMs: number): Promise<Turn> {
  const t0 = now(ctx)
  const r = await request(ctx, 'POST', '/responses', {
    model: a.model,
    input: a.input,
    instructions: a.instructions,
    previous_response_id: a.previous_response_id,
    tools: a.tools,
    // The URLs each search consulted, so a report can tell a page GPT read from one it only saw listed.
    include: a.tools?.some((t: any) => t?.type === 'web_search') ? [SOURCES] : undefined,
    max_output_tokens: a.max_output_tokens,
    reasoning: a.effort ? { effort: a.effort } : undefined,
    background: true,
    store: true,
  }, t0 + waitMs, true).catch(e => {
    // OpenAI documents no idempotency key, so a create that may have reached it is reported, never replayed.
    if (ctx.signal?.aborted || (e instanceof OpenAIError && e.status >= 400 && e.status < 500)) throw e
    throw new Error(`${(e as Error).message} (not retried: OpenAI may have started the response)`)
  })
  const turn = toTurn(r)
  const left = waitMs - (now(ctx) - t0)
  if (turn.status !== 'in_progress' || (left <= 0 && !ctx.signal?.aborted)) return turn
  // A failed first poll must not lose the id: report in_progress, and the next wait polls again.
  return waitTurn(ctx, r.id, Math.max(0, left)).catch((): Turn => ({ id: r.id, status: 'in_progress' }))
}

export async function modelAvailable(ctx: Ctx, model: string): Promise<{ available: boolean; message?: string }> {
  try {
    await request(ctx, 'GET', `/models/${encodeURIComponent(model)}`, undefined, now(ctx) + 10_000)
    return { available: true }
  } catch (e) {
    if (e instanceof OpenAIError && e.status === 404) return { available: false, message: e.message }
    throw e
  }
}

export async function cancelTurn(ctx: Ctx, id: string): Promise<{ id: string; status: string }> {
  const r = await request(ctx, 'POST', `/responses/${encodeURIComponent(id)}/cancel`, undefined, now(ctx) + 30_000)
  return { id: r.id ?? id, status: r.status }
}
