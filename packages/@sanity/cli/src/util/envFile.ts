import fs from 'node:fs'

export interface EnvWriteResult {
  /** Whether the file was created by this write (as opposed to appended to). */
  created: boolean
  /** Keys already present in the file, left untouched. */
  skippedKeys: string[]
  /** Keys appended by this write, in the order given. */
  wroteKeys: string[]
}

function hasKey(contents: string, key: string): boolean {
  return new RegExp(String.raw`^\s*(?:export\s+)?${key}\s*=`, 'm').test(contents)
}

/**
 * Append `values` to the dotenv file at `envPath`, creating the file when missing. Keys already
 * present are never overwritten — the file may hold credentials the user or an agent put there —
 * they are reported back as `skippedKeys` instead. `banner` lines are written as `#` comments
 * above the appended block, so context (e.g. a claim URL) survives after the terminal closes.
 */
export function appendEnvValues(
  envPath: string,
  values: Record<string, string>,
  options?: {banner?: string[]},
): EnvWriteResult {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : undefined

  const wroteKeys = Object.keys(values).filter((key) => !hasKey(existing ?? '', key))
  const skippedKeys = Object.keys(values).filter((key) => hasKey(existing ?? '', key))

  if (wroteKeys.length > 0) {
    const banner = (options?.banner ?? []).map((line) => `# ${line}`)
    const block = [...banner, ...wroteKeys.map((key) => `${key}="${values[key]}"`)].join('\n')
    const separator = existing ? (existing.endsWith('\n') ? '\n' : '\n\n') : ''
    fs.appendFileSync(envPath, `${separator}${block}\n`)
  }

  return {created: existing === undefined, skippedKeys, wroteKeys}
}
