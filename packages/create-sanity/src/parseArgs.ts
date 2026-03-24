/* eslint-disable no-console */
import {parseArgs} from 'node:util'

import {type FlagDef, initFlagDefs} from '../../@sanity/cli/src/actions/init/flags.js'
import {printHelp} from './help.js'

type ParseArgsOption = {
  default?: boolean | string
  multiple?: boolean
  short?: string
  type: 'boolean' | 'string'
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
): Record<string, unknown> {
  const merged = {...values}

  // Resolve aliases to canonical names
  for (const [alias, canonical] of aliasMap) {
    if (merged[alias] !== undefined) {
      if (merged[canonical] !== undefined) {
        console.error(`--${alias} cannot be used with --${canonical}`)
        process.exit(2)
      }
      merged[canonical] = merged[alias]
      delete merged[alias]
    }
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
        console.error(
          `Invalid value "${value}" for --${name}. ` + `Allowed: ${def.options.join(', ')}`,
        )
        process.exit(2)
      }
    }
  }

  // Validate exclusive constraints
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (!def.exclusive || merged[name] === undefined) continue
    for (const other of def.exclusive) {
      if (merged[other] !== undefined) {
        console.error(`--${name} cannot be used with --${other}`)
        process.exit(2)
      }
    }
  }

  return merged
}

/**
 * Parse process.argv using node:util parseArgs with the init flag definitions.
 * Handles --help, aliases, --no-* negation, option validation, and exclusive constraints.
 */
export function parseInitArgs(argv: string[]): {
  args: {type?: string}
  flags: Record<string, unknown>
} {
  const {aliasMap, allowNoFlags, options} = buildParseArgsOptions()
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    args: argv,
    options,
    strict: true,
  })

  if (values.help) {
    printHelp()
  }

  return {
    args: {type: positionals[0]},
    flags: normalizeFlags(values, allowNoFlags, aliasMap),
  }
}
