import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('plugin.json, package.json and the CHANGELOG top entry carry one version', () => {
  const versions = {
    'plugin.json': JSON.parse(read('../.claude-plugin/plugin.json')).version,
    'package.json': JSON.parse(read('../package.json')).version, // also what the bridge reports
    'CHANGELOG.md': /^## (\d+\.\d+\.\d+)/m.exec(read('../CHANGELOG.md'))?.[1],
  }
  assert.equal(new Set(Object.values(versions)).size, 1, `versions differ: ${JSON.stringify(versions)}`)
  assert.match(versions['package.json'], /^\d+\.\d+\.\d+$/)
})
