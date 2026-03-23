/* eslint-disable no-console */
import {parseArgs} from 'node:util'

// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {isInteractive} from '@sanity/cli-core'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {getRunningPackageManager} from '@sanity/cli-core/package-manager'

import {type FlagDef, initFlagDefs} from '../../@sanity/cli/src/actions/init/flags.js'
import {initAction} from '../../@sanity/cli/src/actions/init/initAction.js'
import {InitError} from '../../@sanity/cli/src/actions/init/initError.js'
import {
  flagsToInitOptions,
  type InitCommandFlags,
} from '../../@sanity/cli/src/actions/init/flagsToInitOptions.js'
import {createNoopTelemetryStore} from './noopTelemetry.js'

function getCreateCommand(options?: {withFlagSeparator?: boolean}): string {
  const pm = getRunningPackageManager() ?? 'npm'
  // npm requires `--` to forward flags to the create script, other PMs don't
  const sep = options?.withFlagSeparator && (pm === 'npm' || !pm) ? ' --' : ''
  if (pm === 'bun') return `bun create sanity@latest${sep}`
  if (pm === 'pnpm') return `pnpm create sanity@latest${sep}`
  if (pm === 'yarn') return `yarn create sanity@latest${sep}`
  return `npm create sanity@latest${sep}`
}

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
        process.exit(1)
      }
    }
  }

  // Validate exclusive constraints
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (!def.exclusive || merged[name] === undefined) continue
    for (const other of def.exclusive) {
      if (merged[other] !== undefined) {
        console.error(`--${name} cannot be used with --${other}`)
        process.exit(1)
      }
    }
  }

  return merged
}

try {
  const {aliasMap, allowNoFlags, options} = buildParseArgsOptions()
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options,
    strict: true,
  })

  if (values.help) {
    const cmd = getCreateCommand({withFlagSeparator: true})
    console.log(`Usage: ${cmd} [options]`)
    console.log('')
    console.log('Initialize a new Sanity project')
    console.log('')
    console.log('Options:')
    for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
      if (def.hidden) continue
      const flag = def.short ? `-${def.short}, --${name}` : `    --${name}`
      const val = def.type === 'string' && def.helpValue ? ` ${def.helpValue}` : ''
      console.log(`  ${(flag + val).padEnd(36)} ${def.description || ''}`)
    }
    process.exit(0)
  }

  const flags = normalizeFlags(values, allowNoFlags, aliasMap)
  const args = {type: positionals[0]}

  let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
  if (!flags.mcp || !isInteractive()) {
    mcpMode = 'skip'
  } else if (flags.yes) {
    mcpMode = 'auto'
  }

  const isUnattended = Boolean(flags.yes) || !isInteractive()
  // parseArgs returns Record<string, unknown>; the shape is guaranteed by initFlagDefs
  const initOptions = flagsToInitOptions(
    flags as unknown as InitCommandFlags,
    isUnattended,
    args,
    mcpMode,
  )

  await initAction(initOptions, {
    output: {
      error: (msg: string): never => {
        console.error(msg)
        process.exit(1)
      },
      log: console.log,
      warn: (msg: Error | string) => {
        console.warn(msg instanceof Error ? msg.message : msg)
        return msg
      },
    },
    telemetry: createNoopTelemetryStore(),
    workDir: process.cwd(),
  })
} catch (error) {
  if (error instanceof InitError) {
    if (error.message) {
      console.error(error.message)
    }
    process.exit(error.exitCode)
  }

  // Clean message for unknown flags instead of a raw stack trace
  if (
    error instanceof TypeError &&
    'code' in error &&
    error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
  ) {
    console.error(error.message)
    console.error(`Run "${getCreateCommand()} --help" for available options.`)
    process.exit(1)
  }

  console.error(error)
  process.exit(1)
}
