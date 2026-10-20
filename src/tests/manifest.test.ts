import { describe, expect, test, tier } from 'claude-code/testing'
import { filterArgs, MANIFEST } from '../hooks/manifest'

tier('user')

describe('manifest', () => {
  test('offers Read, Edit, Write and Bash only', async () => {
    expect(MANIFEST.map(t => t.name)).toEqual(['Read', 'Edit', 'Write', 'Bash'])
  })

  test('drops Bash flags GPT may not set and unknown keys', async () => {
    const args = { command: 'ls', run_in_background: true, dangerouslyDisableSandbox: true, extra: 1 }
    expect(filterArgs('Bash', args)).toEqual({ command: 'ls' })
  })

  test('passes unknown tools and non-object args through safely', async () => {
    expect(filterArgs('Agent', { prompt: 'x' })).toEqual({ prompt: 'x' })
    expect(filterArgs('Read', null)).toEqual({})
  })
})
