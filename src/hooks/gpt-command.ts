// The /gpt command's text, and the cost ledger kept in $.store: pure functions over plain data.

type Spend = { usd: number; runs: number; steps: number }

/** `$.store` key `ledger`: spend by calendar month (UTC, YYYY-MM), then by model. */
export type Ledger = Record<string, Record<string, Spend>>

export const USAGE =
  'Usage: /gpt status (this session\'s GPT runs) | /gpt cost (GPT spend by month and model) | ' +
  '/gpt settings (list) | /gpt settings <name> <value> (change one)'

/** One `userConfig` option of plugin.json, as far as /gpt settings needs it. */
export type OptionSpec = { type: string; title: string; options?: readonly string[] }
export type Schema = Readonly<Record<string, OptionSpec>>
export type SettingValue = string | number | boolean

/** What an option accepts, for the listing and for a refusal. */
export function accepts(spec: OptionSpec): string {
  if (spec.type === 'boolean') return 'on | off'
  if (spec.type === 'number') return 'a number above 0'
  return spec.options?.length ? spec.options.join(' | ') : 'text'
}

/** The option `name` names, ignoring case. */
export const findOption = (schema: Schema, name: string) => Object.keys(schema).find(k => k.toLowerCase() === name.toLowerCase())

/** `raw` as the option's typed value, or why it doesn't fit. */
export function parseSetting(schema: Schema, name: string, raw: string): { key: string; value: SettingValue } | { error: string } {
  const key = findOption(schema, name)
  if (key === undefined) return { error: `No setting "${name}". Settings: ${Object.keys(schema).join(', ')}.` }
  const spec = schema[key]!
  const v = raw.trim()
  const no = () => ({ error: `${key} takes ${accepts(spec)}.` })
  if (spec.type === 'boolean') {
    const b = { on: true, true: true, off: false, false: false }[v.toLowerCase()]
    return b === undefined ? no() : { key, value: b }
  }
  if (spec.type === 'number') {
    const n = Number(v)
    return v !== '' && Number.isFinite(n) && n > 0 ? { key, value: n } : no()
  }
  if (spec.options?.length) return spec.options.includes(v) ? { key, value: v } : no()
  return v ? { key, value: v } : no()
}

const shown = (v: SettingValue | undefined) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : v === undefined ? '(unset)' : String(v))

/** The /gpt settings listing: each option's running value and what it accepts. */
export function formatSettings(schema: Schema, values: Readonly<Record<string, SettingValue>>, webMode: string): string {
  const keys = Object.keys(schema)
  const width = Math.max(...keys.map(k => k.length))
  const rows = keys.map(k => `  ${k.padEnd(width)}  ${shown(values[k]).padEnd(8)}  ${accepts(schema[k]!)}  (${schema[k]!.title})`)
  return [
    'GPT settings, as this session runs them:',
    ...rows,
    `Web mode: ${webMode}.`,
    'Change one with /gpt settings <name> <value>; it applies to this session from its next GPT step.',
  ].join('\n')
}

/** The ledger with one GPT step added: its cost, one step, and one run when it is the run's first step. */
export function addToLedger(ledger: Ledger | undefined, month: string, model: string, usd: number, firstStep: boolean): Ledger {
  const months = { ...(ledger ?? {}) }
  const models = { ...(months[month] ?? {}) }
  const e = models[model] ?? { usd: 0, runs: 0, steps: 0 }
  models[model] = { usd: e.usd + usd, runs: e.runs + (firstStep ? 1 : 0), steps: e.steps + 1 }
  months[month] = models
  return months
}

/** Dollars; a nonzero amount never reads as zero. */
export const money = (usd: number) =>
  usd > 0 && usd < 0.0001 ? '<$0.0001' : `$${usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`

export type StatusRow = { id: string; type: string; model: string; description: string; status: string; steps: number; usd: number }

export function formatStatus(rows: readonly StatusRow[]): string {
  if (rows.length === 0) return 'No GPT runs in this session.'
  const lines = rows.map(r => `${r.type}  ${r.id.slice(0, 8)}  ${r.status}  ${r.steps} steps  ${money(r.usd)}  ${r.description}`)
  const total = rows.reduce((sum, r) => sum + r.usd, 0)
  return [...lines, `Total: ${money(total)}`].join('\n')
}

/** `here` is this session's runs (as `/gpt status` lists them); `ledger` covers every session. */
export function formatCost(ledger: Ledger | undefined, month: string, here: readonly StatusRow[] = []): string {
  if (here.length === 0 && (!ledger || Object.keys(ledger).length === 0)) return 'No GPT spend recorded yet.'
  const section = (title: string, models: Record<string, Spend>) => {
    const rows = Object.entries(models).map(([m, e]) => `  ${m}  ${money(e.usd)}  ${e.runs} runs  ${e.steps} steps`)
    const total = Object.values(models).reduce((s, e) => s + e.usd, 0)
    return [`${title}: ${money(total)}`, ...rows].join('\n')
  }
  const add = (into: Record<string, Spend>, m: string, e: Spend) => {
    const a = into[m] ?? { usd: 0, runs: 0, steps: 0 }
    into[m] = { usd: a.usd + e.usd, runs: a.runs + e.runs, steps: a.steps + e.steps }
  }
  const session: Record<string, Spend> = {}
  for (const r of here) add(session, r.model, { usd: r.usd, runs: r.steps > 0 ? 1 : 0, steps: r.steps })
  const allTime: Record<string, Spend> = {}
  for (const models of Object.values(ledger ?? {})) for (const [m, e] of Object.entries(models)) add(allTime, m, e)
  return [section('This session', session), section(`This month (${month})`, ledger?.[month] ?? {}), section('All time', allTime),
    'Estimated from OpenAI list prices; the OpenAI dashboard is the source of truth.'].join('\n\n')
}
