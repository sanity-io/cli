// This catalog grants collection of flag names. Values require a separate enum.
// Removing an entry always reduces collection, including for pinned clients.
const knownFlags = new Set([
  'aspect',
  'bare',
  'cadence',
  'config-path',
  'coupon',
  'create-project',
  'dataset',
  'debug',
  'debug-metafile-path',
  'description',
  'embeddings-projection',
  'env',
  'field',
  'file',
  'filename',
  'force',
  'format',
  'from-export',
  'from-url',
  'generation',
  'git',
  'header',
  'help',
  'host',
  'include',
  'input',
  'json',
  'level',
  'limit',
  'manifest-dir',
  'method',
  'mode',
  'name',
  'offset',
  'order',
  'organization',
  'out',
  'output',
  'output-path',
  'package-manager',
  'params',
  'path',
  'port',
  'project',
  'project-id',
  'project-name',
  'projection',
  'query',
  'raw-field',
  'sort',
  'template',
  'template-token',
  'text',
  'title',
  'token',
  'type',
  'url',
  'version',
  'visibility',
  'watch',
  'watch-patterns',
  'workspace',
  'yes',
])
const values: Record<string, readonly string[]> = {
  cadence: ['weekly', 'monthly'],
  format: ['json', 'ndjson', 'pretty', 'yaml'],
  generation: ['gen1', 'gen2', 'gen3'],
  level: ['error', 'warning', 'info'],
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  mode: ['stream', 'cursor'],
  order: ['asc', 'desc'],
  'package-manager': ['npm', 'pnpm', 'yarn', 'bun'],
  type: ['image', 'file'],
  visibility: ['public', 'private'],
}
const aliases: Record<string, string> = {
  d: 'debug',
  F: 'field',
  f: 'raw-field',
  H: 'header',
  h: 'help',
  i: 'include',
  j: 'json',
  t: 'token',
  v: 'version',
  X: 'method',
  y: 'yes',
}
const shortBooleans = new Set(['d', 'h', 'i', 'j', 'v', 'y'])

function flag(name: string, value?: string): string | undefined {
  if (!knownFlags.has(name)) return undefined
  if (Object.hasOwn(values, name) && value !== undefined && values[name].includes(value)) {
    return `--${name}=${value}`
  }
  return `--${name}`
}

export function sanitizeCliFlags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const result: string[] = []
  for (const argument of input) {
    if (argument === '--') break
    if (typeof argument !== 'string') continue
    const long = /^--([A-Za-z][A-Za-z0-9-]*)(?:=([\s\S]*))?$/.exec(argument)
    if (long) {
      const safe = flag(long[1], long[2])
      if (safe) result.push(safe)
      continue
    }
    if (!/^-[A-Za-z]/.test(argument)) continue
    for (let index = 1; index < argument.length; index++) {
      const short = argument[index]
      if (!Object.hasOwn(aliases, short)) break
      const name = aliases[short]
      if (shortBooleans.has(short)) {
        result.push(`--${name}`)
        continue
      }
      const safe = flag(name, argument.slice(index + 1).replace(/^=/, ''))
      if (safe) result.push(safe)
      break
    }
  }
  return result
}

export function sanitizeCliFlagRecord(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const result: Record<string, boolean> = {}
  for (const [name, value] of Object.entries(input)) {
    if (knownFlags.has(name)) result[name] = Boolean(value)
  }
  return result
}
