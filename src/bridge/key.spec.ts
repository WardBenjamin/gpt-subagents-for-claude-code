import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getKey, keyFile, linuxKey, NO_KEY } from './key.ts'

/** A temp XDG_CONFIG_HOME, with gpt/openai-key written at `mode` when `key` is given. */
async function config(key?: string, mode = 0o600) {
  const dir = await mkdtemp(join(tmpdir(), 'gpt-key-'))
  const env = { XDG_CONFIG_HOME: dir, HOME: '/nonexistent' }
  if (key !== undefined) {
    await mkdir(join(dir, 'gpt'))
    await writeFile(keyFile(env), key)
    await chmod(keyFile(env), mode)
  }
  return env
}

test('OPENAI_API_KEY overrides the Keychain', async () => {
  assert.equal(await getKey({ OPENAI_API_KEY: 'sk-env' }, async () => assert.fail('Keychain read')), 'sk-env')
})

test('missing key: error names the Keychain item and carries no secret', async () => {
  await assert.rejects(getKey({}, async () => undefined), (e: Error) => {
    assert.equal(e.message, NO_KEY)
    assert.match(e.message, /"openai"/)
    return true
  })
})

test('linux: OPENAI_API_KEY skips the key store', async () => {
  assert.equal(await getKey({ OPENAI_API_KEY: 'sk-env' }, async () => assert.fail('store read'), 'linux'), 'sk-env')
})

test('linux: a miss names secret-tool, the key file path and OPENAI_API_KEY, and no key', async () => {
  const env = await config()
  await assert.rejects(getKey(env, () => linuxKey(env, async () => undefined), 'linux'), (e: Error) => {
    assert.match(e.message, /secret-tool store --label='OpenAI API key' service openai/)
    assert.match(e.message, /libsecret-tools/)
    assert.ok(e.message.includes(`install -m 600 /dev/null ${keyFile(env)}`))
    assert.match(e.message, /OPENAI_API_KEY/)
    return true
  })
})

test('darwin: a miss still gives the Keychain message', async () => {
  await assert.rejects(getKey({}, async () => undefined, 'darwin'), { message: NO_KEY })
})

test('a Keychain hit is cached; a miss is retried', async () => {
  let reads = 0
  const read = async () => (++reads === 1 ? undefined : 'sk-keychain')
  await assert.rejects(getKey({}, read))
  assert.equal(await getKey({}, read), 'sk-keychain')
  assert.equal(await getKey({}, read), 'sk-keychain')
  assert.equal(reads, 2)
})

test('OPENAI_API_KEY is trimmed, so a pasted newline is neither sent nor missed by redaction', async () => {
  assert.equal(await getKey({ OPENAI_API_KEY: ' sk-env\n' }, async () => undefined), 'sk-env')
})

test('linux: a keyring hit skips the key file', async () => {
  const env = await config('sk-file', 0o644) // would be refused if read
  assert.equal(await linuxKey(env, async () => 'sk-keyring'), 'sk-keyring')
})

test('linux: a keyring miss reads a 0600 key file, trimmed', async () => {
  assert.equal(await linuxKey(await config('sk-file\n'), async () => undefined), 'sk-file')
})

test('linux: XDG_CONFIG_HOME unset resolves under HOME/.config', async () => {
  const home = await mkdtemp(join(tmpdir(), 'gpt-home-'))
  await mkdir(join(home, '.config/gpt'), { recursive: true })
  await writeFile(join(home, '.config/gpt/openai-key'), 'sk-home')
  await chmod(join(home, '.config/gpt/openai-key'), 0o600)
  assert.equal(keyFile({ HOME: home }), join(home, '.config/gpt/openai-key'))
  assert.equal(await linuxKey({ HOME: home }, async () => undefined), 'sk-home')
})

test('linux: a missing or empty key file gives no key', async () => {
  assert.equal(await linuxKey(await config(), async () => undefined), undefined)
  assert.equal(await linuxKey(await config(''), async () => undefined), undefined)
})

test('linux: a key file others can read is refused by name, without its key', async () => {
  const env = await config('sk-known-secret', 0o644)
  await assert.rejects(linuxKey(env, async () => undefined), (e: Error) => {
    assert.ok(e.message.includes(keyFile(env)))
    assert.match(e.message, /chmod 600/)
    assert.doesNotMatch(e.message, /sk-known-secret/)
    return true
  })
})
