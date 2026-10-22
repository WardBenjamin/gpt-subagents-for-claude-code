/**
 * The gpt plugin's session state: one run record per gpt:* subagent, keyed by its agentId.
 */
export type GptRun = {
  /** OpenAI response id of GPT's last completed turn; the next step continues from it. */
  responseId?: string
  /** GPT call_ids yielded at the last step, whose tool results the next step sends back. */
  pending: string[]
  /** How many user text messages GPT has been given (the prompt, then each resume). */
  userTexts: number
  /** GPT steps run, and their priced cost in USD. */
  steps: number
  costUsd: number
  /** True after the step that delivered the report, until new user text arrives. */
  handedBack: boolean
  /** The last SubagentHandback attempt, so a refused one can be re-sent as plain text. */
  report?: { id: string; message: string }
  /** The run's web activity at OpenAI, for the list that ends the report. */
  web?: GptRunWeb
}

/** A run's web activity: each action once, the URLs its searches listed, and the URLs GPT cited. */
export type GptRunWeb = {
  actions: Array<{ type: string; query?: string; url?: string }>
  /** Actions past the cap, counted but not kept. */
  more: number
  sources: string[]
  cited: string[]
}

/** One GPT run of this session: its type name (`sol`, `astra`, `luna`) and the Agent call's description. */
export type GptRunInfo = { type: string; description: string }

declare module 'claude-code' {
  interface PluginState {
    /** `session` lists this session's GPT runs by agentId; `$.agent.list()` drops a run once it ends. */
    gpt: { runs: StateFamily<GptRun>; session: Record<string, GptRunInfo> }
  }
}
