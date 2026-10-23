// Pure translation between a gpt:* subagent's transcript and GPT turns, and between a GPT turn
// and a turn.step response (the chunks the hook yields and the result it returns).
import type { GptRun, GptRunWeb } from '../types'
import { filterArgs } from './manifest'

export type Msg = {
  role: string
  text?: string
  toolResults?: ReadonlyArray<{ tool_use_id: string; text?: string; isError?: boolean }>
}
export type BridgeTurn = {
  id: string
  status: string
  text?: string
  calls?: Array<{ call_id: string; name: string; args: unknown; argsError?: string }>
  webActions?: Array<{ type: string; query?: string; url?: string; sources?: string[]; pages?: string[] }>
  citations?: string[]
  notices?: string[]
  usage?: { input: number; cached: number; output: number }
  costUsd?: number | null
  reason?: string
}
export type Chunk =
  | { kind: 'text'; index: number; text: string }
  | { kind: 'tool'; index: number; id: string; name: string }
  | { kind: 'input'; index: number; json: string }
  | { kind: 'stop'; stopReason: 'tool_use' | 'end_turn'; usage: null }
export type StepOut = {
  chunks: Chunk[]
  answer: string
  toolUses: Array<{ name: string; input: unknown }>
  stopReason: 'tool_use' | 'end_turn'
  /** Always null: GPT's tokens are not Anthropic usage (the engine would label them with the Claude model). */
  usage: null
  pending: string[]
  handedBack: boolean
  /** Set when the report went out as SubagentHandback. */
  report?: { id: string; message: string }
}
export type Plan =
  | { kind: 'end' }
  | { kind: 'text'; text: string }
  | { kind: 'gpt'; input: unknown; previous_response_id?: string; userTexts: number }

export const FRESH: GptRun = { pending: [], userTexts: 0, steps: 0, costUsd: 0, handedBack: false }

/** The tool_use id for a GPT call: Anthropic-style prefix, GPT's call_id kept so results map back. */
export const toolUseId = (callId: string) => `toolu_${callId}`.replace(/[^a-zA-Z0-9_-]/g, '_')

const userTexts = (msgs: readonly Msg[]) =>
  msgs.filter(m => m.role === 'user' && !m.toolResults?.length && m.text?.trim()).map(m => m.text!.trim())

/** What the next GPT turn needs: the prompt first, then tool results and any new user text (a resume). */
export function planStep(msgs: readonly Msg[], run: GptRun): Plan {
  const texts = userTexts(msgs)
  const fresh = texts.slice(run.userTexts)
  const results = new Map(msgs.flatMap(m => m.toolResults ?? []).map(r => [r.tool_use_id, r] as const))
  if (run.handedBack && fresh.length === 0) {
    // A refused SubagentHandback (the engine didn't offer it) is re-sent as the turn's final text.
    const refused = run.report && results.get(run.report.id)?.isError
    return refused ? { kind: 'text', text: run.report!.message } : { kind: 'end' }
  }
  if (!run.responseId) return { kind: 'gpt', input: texts.join('\n\n'), userTexts: texts.length }
  const outputs = run.pending.map(callId => {
    const r = results.get(toolUseId(callId))
    const output = !r ? 'ERROR: no result was recorded for this call' : r.isError ? `ERROR: ${r.text ?? ''}` : (r.text ?? '')
    return { type: 'function_call_output', call_id: callId, output }
  })
  return {
    kind: 'gpt',
    input: [...outputs, ...fresh.map(text => ({ role: 'user', content: text }))],
    previous_response_id: run.responseId,
    userTexts: texts.length,
  }
}

/**
 * Delivers `message` as the subagent's report, in the form the engine offers: SubagentHandback where it
 * offers that tool (auto mode on 2.1.299), else the turn's final text, which the engine takes as the report.
 */
export function report(message: string, seed: string, viaHandback: boolean, preface = ''): StepOut {
  if (!viaHandback) {
    const text = preface ? `${preface}\n\n${message}` : message
    return { chunks: [{ kind: 'text', index: 0, text }, { kind: 'stop', stopReason: 'end_turn', usage: null }],
      answer: text, toolUses: [], stopReason: 'end_turn', usage: null, pending: [], handedBack: true }
  }
  const id = toolUseId(`handback_${seed}`)
  const input = { message }
  const lead: Chunk[] = preface ? [{ kind: 'text', index: 0, text: preface }] : []
  const at = lead.length
  return {
    chunks: [
      ...lead,
      { kind: 'tool', index: at, id, name: 'SubagentHandback' },
      { kind: 'input', index: at, json: JSON.stringify(input) },
      { kind: 'stop', stopReason: 'tool_use', usage: null },
    ],
    answer: preface,
    toolUses: [{ name: 'SubagentHandback', input }],
    stopReason: 'tool_use',
    usage: null,
    pending: [],
    handedBack: true,
    report: { id, message },
  }
}

/** The bare end of a turn, after the hand-back's result. */
export function endTurn(): StepOut {
  return { chunks: [{ kind: 'stop', stopReason: 'end_turn', usage: null }], answer: '', toolUses: [], stopReason: 'end_turn', usage: null, pending: [], handedBack: true }
}

/** Whether the engine offers this subagent SubagentHandback: its reminder is in the API transcript. */
export const offersHandback = (apiMessages: unknown) => JSON.stringify(apiMessages).includes('delivered through SubagentHandback')

const WEB_KEEP = 50 // actions listed in a report; sources and citations are kept to ten times that
/** A URL as cited and as listed by a search agree: no fragment, no utm_* tracking, no trailing slash. */
export function normUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k)
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

/** The run's web activity with one turn's added: actions once each, plus the sources and citations seen. */
export function addWeb(web: GptRunWeb | undefined, t: BridgeTurn): GptRunWeb | undefined {
  if (!t.webActions?.length && !t.citations?.length && !t.notices?.length) return web
  const next: GptRunWeb = {
    actions: [...(web?.actions ?? [])], more: web?.more ?? 0, sources: [...(web?.sources ?? [])], cited: [...(web?.cited ?? [])],
    pages: [...(web?.pages ?? [])], notices: [...(web?.notices ?? []), ...(t.notices ?? [])].slice(0, 4 * NOTICES),
  }
  const key = (a: { type: string; query?: string; url?: string; pages?: readonly string[] }) =>
    `${a.type} ${a.query ?? ''} ${a.url ? normUrl(a.url) : ''} ${(a.pages ?? []).map(normUrl).join(' ')}`
  const have = new Set(next.actions.map(key))
  for (const { sources, pages, ...rest } of t.webActions ?? []) {
    const a = { ...rest, ...(rest.type === 'search' && sources?.length && { results: sources.length }), ...(pages?.length && { pages }) }
    if (!have.has(key(a))) {
      have.add(key(a))
      if (next.actions.length < WEB_KEEP) next.actions.push(a)
      else next.more++
    }
    for (const u of sources ?? []) if (!next.sources.includes(normUrl(u))) next.sources.push(normUrl(u))
    const read = [...(pages ?? []), ...(a.type !== 'search' && a.url ? [a.url] : [])]
    for (const u of read) if (!next.pages!.includes(normUrl(u))) next.pages!.push(normUrl(u))
  }
  for (const u of t.citations ?? []) if (!next.cited.includes(normUrl(u))) next.cited.push(normUrl(u))
  next.sources = next.sources.slice(-10 * WEB_KEEP)
  next.cited = next.cited.slice(0, 10 * WEB_KEEP)
  next.pages = next.pages!.slice(0, 10 * WEB_KEEP)
  return next
}

const NOTICES = 5 // web-tool notices shown in a report
const WEB_LINES = 100 // action and page lines shown in a report; a page line is a URL, so cheap
const BUDGET_HINT = '- To let GPT read more pages in a run, run /gpt settings webBudget unlimited (it can be slower and cost more).'

/**
 * The list that ends a report, from OpenAI's record: each search with its result count, each page action with
 * the pages it returned (each page once), then cited pages no action returned, then what the web tool said.
 */
export function webActivity(web: GptRunWeb | undefined, budget = 'default'): string {
  const notices = web?.notices ?? []
  if (!web || (!web.actions.length && !web.cited.length && !notices.length)) return ''
  const listed = new Set<string>()
  const lines: string[] = []
  for (const a of web.actions) {
    const pages = (a.pages ?? []).filter(u => !listed.has(normUrl(u)))
    pages.forEach(u => listed.add(normUrl(u)))
    if ((a.pages?.length ?? 0) > 1) lines.push(`- ${webLine(a, a.pages!.length)}:`, ...pages.map(u => `  - ${u}`))
    else lines.push(`- ${webLine(a)}`)
  }
  if (lines.length > WEB_LINES) lines.splice(WEB_LINES, Infinity, `- …and ${lines.length - WEB_LINES} more lines of web activity, left out to keep the report short`)
  if (web.more) lines.push(`- …and ${web.more} more web actions`)
  const read = new Set(web.pages ?? [])
  for (const a of web.actions) if (a.url && a.type !== 'search') read.add(normUrl(a.url))
  for (const u of web.cited) if (!read.has(u)) lines.push(`- cited, not opened: ${u} (${web.sources.includes(u) ? 'in search results' : 'not seen'})`)
  for (const n of notices.slice(0, NOTICES)) lines.push(`- the web tool said: "${n}"`)
  if (notices.length > NOTICES) lines.push(`- …and ${notices.length - NOTICES} more notices`)
  if (notices.length && budget === 'default') lines.push(BUDGET_HINT)
  return `Web activity (at OpenAI):\n${lines.join('\n')}`
}

/** One web action in words; `pages` when a page action returned more than one. */
const webLine = (a: { type: string; query?: string; url?: string; results?: number }, pages?: number) =>
  a.type === 'search' ? `searched "${a.query ?? ''}"${a.results ? ` (${a.results} results)` : ''}`
    : a.type === 'open_page' ? (pages ? `opened ${pages} pages` : `opened ${a.url ?? ''}`)
    : a.type === 'find_in_page' ? (pages ? `searched ${pages} pages for "${a.query ?? ''}"` : `searched in ${a.url ?? ''} for "${a.query ?? ''}"`)
    : `${a.type.replace(/_/g, ' ')}${a.url ? ` ${a.url}` : ''}${a.query ? ` "${a.query}"` : ''}`

/** One transcript line per web action GPT took at OpenAI, so its searches and pages stay visible. */
export function webLines(t: BridgeTurn): string {
  return (t.webActions ?? []).map(a => `[web] ${(a.pages?.length ?? 0) > 1 ? `${webLine(a, a.pages!.length)}, ${a.pages![0]} first` : webLine(a)}`).join('\n')
}

/** `message` with the run's web-activity list after it, when the run used the web. */
export const withWeb = (message: string, web: GptRunWeb | undefined, budget?: string) => [message, webActivity(web, budget)].filter(Boolean).join('\n\n')

/** A finished GPT turn as a step: its text and tool calls, or its answer as the report, ending with `runWeb`'s list. */
export function stepFromTurn(t: BridgeTurn, viaHandback: boolean, runWeb?: GptRunWeb, budget?: string): StepOut {
  const web = webLines(t)
  if (t.status !== 'completed') {
    const why = `GPT run ended: ${t.status}${t.reason ? ` (${t.reason})` : ''}.`
    return report(withWeb(t.text ? `${why}\n\n${t.text}` : why, runWeb, budget), t.id, viaHandback, web)
  }
  const calls = t.calls ?? []
  if (calls.length === 0) return report(withWeb(t.text || '(GPT finished without a message.)', runWeb, budget), t.id, viaHandback, web)
  const text = [web, t.text ?? ''].filter(Boolean).join('\n\n')

  const chunks: Chunk[] = text ? [{ kind: 'text', index: 0, text }] : []
  const base = chunks.length
  const toolUses = calls.map((c, i) => {
    const input = filterArgs(c.name, c.args)
    chunks.push({ kind: 'tool', index: base + i, id: toolUseId(c.call_id), name: c.name })
    chunks.push({ kind: 'input', index: base + i, json: JSON.stringify(input) })
    return { name: c.name, input }
  })
  chunks.push({ kind: 'stop', stopReason: 'tool_use', usage: null })
  return { chunks, answer: text, toolUses, stopReason: 'tool_use', usage: null, pending: calls.map(c => c.call_id), handedBack: false }
}
