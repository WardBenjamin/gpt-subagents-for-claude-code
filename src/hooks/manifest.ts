// GPT's function tools: Claude Code's Read, Edit, Write and Bash, hand-written from the
// Claude Code 2.1.299 tool types ($.tool.list() gives names only). Pinned to that build.

const str = (description: string) => ({ type: 'string', description })
const num = (description: string) => ({ type: 'number', description })
const bool = (description: string) => ({ type: 'boolean', description })

const TOOLS: Record<string, { description: string; properties: Record<string, object>; required: string[] }> = {
  Read: {
    description: 'Read a file. Use absolute paths. Returns numbered lines.',
    properties: {
      file_path: str('Absolute path of the file to read.'),
      offset: num('Line to start from, for large files.'),
      limit: num('Number of lines to read, for large files.'),
    },
    required: ['file_path'],
  },
  Edit: {
    description: 'Replace exact text in a file you have already read. old_string must be unique unless replace_all is true.',
    properties: {
      file_path: str('Absolute path of the file to modify.'),
      old_string: str('The exact text to replace.'),
      new_string: str('The replacement text; must differ from old_string.'),
      replace_all: bool('Replace every occurrence (default false).'),
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  Write: {
    description: 'Create or overwrite a file with the given content. Use absolute paths.',
    properties: {
      file_path: str('Absolute path of the file to write.'),
      content: str('The full file content.'),
    },
    required: ['file_path', 'content'],
  },
  Bash: {
    description: 'Run a shell command. Search code with `rg -n <pattern> <path>`.',
    properties: {
      command: str('The command to run.'),
      description: str('What the command does, in a few words.'),
      timeout: num('Timeout in milliseconds (max 600000).'),
    },
    required: ['command'],
  },
}

/** The Responses API function tools offered to GPT. */
export const MANIFEST = Object.entries(TOOLS).map(([name, t]) => ({
  type: 'function',
  name,
  description: t.description,
  parameters: { type: 'object', properties: t.properties, required: t.required },
  strict: false,
}))

/** Keeps only the manifest's properties for a known tool (drops e.g. run_in_background); unknown tools pass as-is. */
export function filterArgs(name: string, args: unknown): Record<string, unknown> {
  const obj = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const tool = TOOLS[name]
  if (!tool) return obj
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k in tool.properties))
}
