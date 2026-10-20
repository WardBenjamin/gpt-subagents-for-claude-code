// The OpenAI API key: OPENAI_API_KEY in the bridge's own environment, else the platform's store
// (macOS Keychain; on Linux the Secret Service, then an owner-only key file).
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'

export const NO_KEY =
  'No OpenAI key found: add one to the macOS Keychain as the generic-password item "openai" ' +
  '(security add-generic-password -s openai -a "$USER" -w), or set OPENAI_API_KEY for the bridge.'

export const keyFile = (env: NodeJS.ProcessEnv) => `${env.XDG_CONFIG_HOME || `${env.HOME}/.config`}/gpt/openai-key`

export const noLinuxKey = (path: string) =>
  'No OpenAI key found: store one in the Secret Service with ' +
  "secret-tool store --label='OpenAI API key' service openai (from libsecret-tools), " +
  `or, without a keyring, create ${path} with install -m 600 /dev/null ${path} and write the key into it, ` +
  'or set OPENAI_API_KEY for the bridge.'

type Read = () => Promise<string | undefined>

const run = (cmd: string, args: string[], timeout?: number): Promise<string | undefined> =>
  new Promise(resolve => execFile(cmd, args, { timeout }, (err, out) => resolve(err ? undefined : out.trim() || undefined)))

const keychain: Read = () => run('/usr/bin/security', ['find-generic-password', '-s', 'openai', '-w'])

// 15 s bounds a hung D-Bus call and leaves time for a desktop unlock prompt; only the first call pays it.
const secretTool: Read = () => run('secret-tool', ['lookup', 'service', 'openai'], 15_000)

/** Linux: the Secret Service, else the key file, which must give group and others no access. */
export async function linuxKey(env: NodeJS.ProcessEnv = process.env, lookup: Read = secretTool) {
  const fromKeyring = await lookup()
  if (fromKeyring) return fromKeyring
  const path = keyFile(env)
  const mode = await stat(path).then(s => s.mode, () => undefined)
  if (mode === undefined) return undefined
  if (mode & 0o077) throw new Error(`The OpenAI key file ${path} is readable by other users: run chmod 600 ${path}.`)
  return (await readFile(path, 'utf8')).trim() || undefined
}

let found: string | undefined // only a hit is cached, so a key added later is picked up without a restart

export async function getKey(env: NodeJS.ProcessEnv = process.env, read?: Read, platform = process.platform): Promise<string> {
  if (env.OPENAI_API_KEY?.trim()) return env.OPENAI_API_KEY.trim()
  const linux = platform === 'linux'
  found ??= await (read ?? (linux ? () => linuxKey(env) : keychain))()
  if (!found) throw new Error(linux ? noLinuxKey(keyFile(env)) : NO_KEY)
  return found
}
