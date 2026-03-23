/* eslint-disable no-console */
import {parseArgs} from 'node:util'

import {isInteractive} from '@sanity/cli-core'

import {initFlagDefs} from '../../@sanity/cli/src/actions/init/flags.js'
import {initAction} from '../../@sanity/cli/src/actions/init/initAction.js'
import {InitError} from '../../@sanity/cli/src/actions/init/initError.js'
import {flagsToInitOptions} from '../../@sanity/cli/src/actions/init/types.js'
import {createNoopTelemetryStore} from './noopTelemetry.js'

function buildParseArgsOptions() {
  const options: Record<
    string,
    {type: 'boolean' | 'string'; default?: boolean | string; multiple?: boolean; short?: string}
  > = {}
  const allowNoFlags = new Set<string>()

  for (const [name, def] of Object.entries(initFlagDefs)) {
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
  }

  // Built-in --help support
  options.help = {type: 'boolean', short: 'h'}

  return {options, allowNoFlags}
}

function mergeNegatedFlags(
  values: Record<string, unknown>,
  allowNoFlags: Set<string>,
): Record<string, unknown> {
  const merged = {...values}
  for (const name of allowNoFlags) {
    const noKey = `no-${name}`
    if (merged[noKey] === true) {
      merged[name] = false
    }
    delete merged[noKey]
  }
  return merged
}

try {
  const {options, allowNoFlags} = buildParseArgsOptions()
  const {positionals, values} = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: create-sanity [options]')
    console.log('')
    console.log('Initialize a new Sanity project')
    console.log('')
    console.log('Options:')
    for (const [name, def] of Object.entries(initFlagDefs)) {
      if (def.hidden) continue
      const flag = def.short ? `-${def.short}, --${name}` : `    --${name}`
      const val = def.type === 'string' && def.helpValue ? ` ${def.helpValue}` : ''
      console.log(`  ${(flag + val).padEnd(36)} ${def.description || ''}`)
    }
    process.exit(0)
  }

  const flags = mergeNegatedFlags(values, allowNoFlags) as Record<string, unknown>
  const args = {type: positionals[0]}

  let mcpMode: 'auto' | 'prompt' | 'skip' = 'prompt'
  if (!flags.mcp || !isInteractive()) {
    mcpMode = 'skip'
  } else if (flags.yes) {
    mcpMode = 'auto'
  }

  const isUnattended = Boolean(flags.yes) || !isInteractive()
  const initOptions = flagsToInitOptions(
    {...flags, 'from-create': true} as Parameters<typeof flagsToInitOptions>[0],
    isUnattended,
    args,
    mcpMode,
  )

  await initAction(initOptions, {
    output: {
      log: console.log,
      warn: console.warn,
      error: (msg: string) => {
        console.error(msg)
        process.exit(1)
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
  console.error(error)
  process.exit(1)
}
