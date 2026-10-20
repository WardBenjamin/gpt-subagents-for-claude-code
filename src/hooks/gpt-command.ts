// The /gpt command's text, and the cost ledger kept in $.store: pure functions over plain data.

type Spend = { usd: number; runs: number; steps: number }

/** `$.store` key `ledger`: spend by calendar month (UTC, YYYY-MM), then by model. */
export type Ledger = Record<string, Record<string, Spend>>

export const USAGE = 'Usage: /gpt status (this session\'s GPT runs) | /gpt cost (GPT spend by month and model)'

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
