// Test helpers shared by the bridge's *.test.ts files.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Ctx } from './responses.ts'

export const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

/** A reply: [status, JSON body], or a fetch stand-in for errors, odd bodies and slow answers. */
export type Reply = [number, unknown] | ((url: string, init: RequestInit) => Promise<Response>)

/** A Ctx whose fetch answers from `replies` in order and whose clock only moves when it sleeps or `tick`s. */
export function fakeCtx(replies: Reply[]) {
  let t = 0
  const seen: Array<{ url: string; init: RequestInit }> = []
  const ctx: Ctx = {
    key: 'sk-test-secret',
    now: () => t,
    sleep: async ms => { t += ms },
    random: () => 0.5,
    fetch: (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      const reply = replies.shift() ?? assert.fail(`unexpected fetch ${url}`)
      if (typeof reply === 'function') return reply(url, init)
      return new Response(JSON.stringify(reply[1]), { status: reply[0] })
    }) as typeof fetch,
  }
  return { ctx, seen, elapsed: () => t, tick: (ms: number) => { t += ms } }
}
