import { describe, expect, test, tier } from 'claude-code/testing'
import { endTurn, FRESH, offersHandback, planStep, report, stepFromTurn, toolUseId } from '../hooks/step'

tier('user')

const prompt = { role: 'user', text: 'Summarize /work/a.txt' }

describe('step', () => {
  test('first step sends the prompt as text, with no previous response', async () => {
    expect(planStep([prompt], FRESH)).toEqual({ kind: 'gpt', input: 'Summarize /work/a.txt', userTexts: 1 })
  })

  test('later steps send each pending call result by call_id, refusals as ERROR', async () => {
    const run = { ...FRESH, responseId: 'resp_1', pending: ['call_a', 'call_b'], userTexts: 1, steps: 1 }
    const msgs = [
      prompt,
      { role: 'assistant' },
      {
        role: 'user',
        toolResults: [
          { tool_use_id: toolUseId('call_a'), text: '1\thello', isError: false },
          { tool_use_id: toolUseId('call_b'), text: 'auto mode classifier gave no verdict', isError: true },
        ],
      },
    ]
    expect(planStep(msgs, run)).toEqual({
      kind: 'gpt',
      previous_response_id: 'resp_1',
      userTexts: 1,
      input: [
        { type: 'function_call_output', call_id: 'call_a', output: '1\thello' },
        { type: 'function_call_output', call_id: 'call_b', output: 'ERROR: auto mode classifier gave no verdict' },
      ],
    })
  })

  test('after a hand-back, no new text ends the turn; a resume message continues GPT', async () => {
    const run = { ...FRESH, responseId: 'resp_2', userTexts: 1, steps: 2, handedBack: true }
    expect(planStep([prompt], run)).toEqual({ kind: 'end' })
    const resumed = planStep([prompt, { role: 'assistant' }, { role: 'user', text: 'Now quote line 2' }], run)
    expect(resumed).toEqual({
      kind: 'gpt',
      previous_response_id: 'resp_2',
      userTexts: 2,
      input: [{ role: 'user', content: 'Now quote line 2' }],
    })
  })

  test('a refused SubagentHandback is re-sent as the final text; an accepted one ends the turn', async () => {
    const sent = report('Summary: hello.', 'resp_9', true)
    const run = { ...FRESH, responseId: 'resp_9', userTexts: 1, steps: 1, handedBack: true, report: sent.report }
    const answered = (isError: boolean) => [prompt, { role: 'assistant' }, { role: 'user', toolResults: [{ tool_use_id: sent.report!.id, text: isError ? 'No such tool available' : '{"success":true}', isError }] }]
    expect(planStep(answered(true), run)).toEqual({ kind: 'text', text: 'Summary: hello.' })
    expect(planStep(answered(false), run)).toEqual({ kind: 'end' })
  })

  test('the hand-back form is detected from the engine reminder in the API transcript', async () => {
    expect(offersHandback([{ role: 'user', content: [{ type: 'text', text: 'Your final report is delivered through SubagentHandback.' }] }])).toBe(true)
    expect(offersHandback([{ role: 'user', content: 'Summarize /work/a.txt' }])).toBe(false)
  })

  test('a turn with calls becomes text + tool chunks with filtered args and no Anthropic usage', async () => {
    const out = stepFromTurn({
      id: 'resp_3',
      status: 'completed',
      text: 'Reading it.',
      calls: [{ call_id: 'call_x', name: 'Bash', args: { command: 'ls', run_in_background: true } }],
      usage: { input: 100, cached: 40, output: 7 },
      costUsd: 0.001,
    }, true)
    expect(out.chunks).toEqual([
      { kind: 'text', index: 0, text: 'Reading it.' },
      { kind: 'tool', index: 1, id: 'toolu_call_x', name: 'Bash' },
      { kind: 'input', index: 1, json: '{"command":"ls"}' },
      { kind: 'stop', stopReason: 'tool_use', usage: null },
    ])
    expect(out.usage).toBeNull()
    expect([out.pending, out.handedBack]).toEqual([['call_x'], false])
  })

  test('a turn without calls reports GPT\'s answer: SubagentHandback where offered, else final text', async () => {
    const turn = { id: 'resp_4', status: 'completed', text: 'Done: it says hello.', calls: [] }
    const viaTool = stepFromTurn(turn, true)
    expect(viaTool.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: 'Done: it says hello.' } }])
    const viaText = stepFromTurn(turn, false)
    expect([viaText.answer, viaText.stopReason, viaText.toolUses]).toEqual(['Done: it says hello.', 'end_turn', []])
    expect([viaTool.handedBack, viaText.handedBack]).toEqual([true, true])
  })

  test('a final answer after web actions keeps the [web] lines in the transcript, before the hand-back', async () => {
    const out = stepFromTurn({ id: 'resp_6', status: 'completed', text: 'Summary.', calls: [], webActions: [{ type: 'search', query: 'q' }] }, true)
    expect(out.chunks.slice(0, 2)).toEqual([
      { kind: 'text', index: 0, text: '[web] searched "q"' },
      { kind: 'tool', index: 1, id: 'toolu_handback_resp_6', name: 'SubagentHandback' },
    ])
    expect(out.toolUses).toEqual([{ name: 'SubagentHandback', input: { message: 'Summary.' } }])
    const asText = stepFromTurn({ id: 'resp_6', status: 'completed', text: 'Summary.', calls: [], webActions: [{ type: 'search', query: 'q' }] }, false)
    expect(asText.answer).toBe('[web] searched "q"\n\nSummary.')
  })

  test('an incomplete turn hands back the reason and partial text', async () => {
    const out = stepFromTurn({ id: 'resp_5', status: 'incomplete', reason: 'max_output_tokens', text: 'Partial' }, true)
    expect(out.toolUses[0]).toEqual({ name: 'SubagentHandback', input: { message: 'GPT run ended: incomplete (max_output_tokens).\n\nPartial' } })
  })

  test('the end of a turn is a bare end_turn stop', async () => {
    expect(endTurn().stopReason).toBe('end_turn')
  })
})
