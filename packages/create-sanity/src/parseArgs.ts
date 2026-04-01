import {parseArgs} from 'node:util'

import {type FlagDef, initFlagDefs} from '../../@sanity/cli/src/actions/init/flags.js'
import {printHelp} from './help.js'

type ParseArgsOption = {
  default?: boolean | string
  multiple?: boolean
  short?: string
  type: 'boolean' | 'string'
}

/**
 * Thrown when flag validation fails (alias conflicts, invalid option values,
 * exclusive constraint violations). Caught in the top-level entry point
 * (`index.ts`) and translated to `console.error` + `process.exit(2)`.
 */
export class FlagValidationError extends Error {
  override name = 'FlagValidationError'
}

/**
 * Parse process.argv using node:util parseArgs with the init flag definitions.
 * Handles --help, aliases, --no-* negation, option validation, and exclusive constraints.
 *
 * @internal
 */
export function parseInitArgs(argv: string[]): {
  args: {type?: string}
  flags: Record<string, unknown>
} {
  const {aliasMap, allowNoFlags, options} = buildParseArgsOptions()

  // Parse leniently first so --help works even alongside unknown flags.
  // With strict: true, parseArgs throws on unknown options before we can check
  // for --help in the result.
  const lenient = parseArgs({
    allowPositionals: true,
    args: argv,
    options,
    strict: false,
  })
  if (lenient.values.help) {
    printHelp()
  }

  // Now parse strictly to validate all flags
  const {positionals, tokens, values} = parseArgs({
    allowPositionals: true,
    args: argv,
    options,
    strict: true,
    tokens: true,
  })

  // Collect the set of flags explicitly provided on the command line.
  // Flags that only have a value because of their `default` are excluded.
  const explicitFlags = new Set<string>()
  for (const token of tokens) {
    if (token.kind === 'option') {
      let name = token.name
      // Resolve aliases to canonical names
      name = aliasMap.get(name) ?? name
      // Resolve --no-<flag> companions to their base flag
      if (name.startsWith('no-') && allowNoFlags.has(name.slice(3))) {
        name = name.slice(3)
      }
      explicitFlags.add(name)
    }
  }

  return {
    args: {type: positionals[0]},
    flags: normalizeFlags(values, allowNoFlags, aliasMap, explicitFlags),
  }
}

function buildParseArgsOptions() {
  const options: Record<string, ParseArgsOption> = {}
  const allowNoFlags = new Set<string>()
  // Maps alias name → canonical flag name (e.g. 'project-id' → 'project')
  const aliasMap = new Map<string, string>()

  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (def.type !== 'boolean' && def.type !== 'string') {
      throw new Error(`Unknown flag type "${def.type}" for flag "${name}"`)
    }

    options[name] = {type: def.type}
    if (def.short) options[name].short = def.short
    if (def.default !== undefined) options[name].default = def.default

    if (def.type === 'boolean' && def.allowNo) {
      allowNoFlags.add(name)
      options[`no-${name}`] = {type: 'boolean'}
    }

    // Register aliases as separate parseArgs options that map back to the canonical name
    if (def.aliases) {
      for (const alias of def.aliases) {
        options[alias] = {type: def.type}
        aliasMap.set(alias, name)
      }
    }
  }

  // Built-in --help support
  options.help = {short: 'h', type: 'boolean'}

  return {aliasMap, allowNoFlags, options}
}

/**
 * Merge --no-<flag> companions back into the base flag, resolve aliases
 * to canonical names, and validate option constraints.
 */
function normalizeFlags(
  values: Record<string, unknown>,
  allowNoFlags: Set<string>,
  aliasMap: Map<string, string>,
  explicitFlags: Set<string>,
): Record<string, unknown> {
  const merged = {...values}

  // Resolve aliases to canonical names
  for (const [alias, canonical] of aliasMap) {
    if (explicitFlags.has(alias)) {
      if (explicitFlags.has(canonical)) {
        throw new FlagValidationError(`--${alias} cannot be used with --${canonical}`)
      }
      merged[canonical] = merged[alias]
    }
    delete merged[alias]
  }

  // Merge --no-<flag> companions
  for (const name of allowNoFlags) {
    const noKey = `no-${name}`
    if (merged[noKey] === true) {
      merged[name] = false
    }
    delete merged[noKey]
  }

  // Validate string flags with `options` constraints
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (def.options && merged[name] !== undefined) {
      const value = String(merged[name])
      if (!def.options.includes(value)) {
        throw new FlagValidationError(
          `Invalid value "${value}" for --${name}. Allowed: ${def.options.join(', ')}`,
        )
      }
    }
  }

  // Validate exclusive constraints — only check flags explicitly provided by the
  // user. Flags present only because of their `default` value are not conflicts.
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (!def.exclusive || !explicitFlags.has(name)) continue
    for (const other of def.exclusive) {
      if (explicitFlags.has(other)) {
        throw new FlagValidationError(`--${name} cannot be used with --${other}`)
      }
    }
  }

  // Warn about deprecated flags that were explicitly provided
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (!def.deprecated || !explicitFlags.has(name)) continue
    const dep = def.deprecated
    const parts = [`Warning: --${name} is deprecated`]
    if (typeof dep === 'object' && dep.version) {
      parts.push(` as of v${dep.version}`)
    }
    parts.push('.')
    if (typeof dep === 'object' && dep.message) {
      parts.push(` ${dep.message}.`)
    }
    // eslint-disable-next-line no-console -- CLI output for deprecated flag warnings
    console.warn(parts.join(''))
  }

  return merged
}
