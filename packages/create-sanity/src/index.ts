/* eslint-disable no-console */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {isInteractive} from '@sanity/cli-core'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {CLIError} from '@sanity/cli-core/errors'

import {
  flagsToInitOptions,
  type InitCommandFlags,
} from '../../@sanity/cli/src/actions/init/flagsToInitOptions.js'
import {initAction} from '../../@sanity/cli/src/actions/init/initAction.js'
import {InitError} from '../../@sanity/cli/src/actions/init/initError.js'
import {getCreateCommand} from './createCommand.js'
import {createNoopTelemetryStore} from './noopTelemetry.js'
import {parseInitArgs} from './parseArgs.js'

try {
  const {args, flags} = parseInitArgs(process.argv.slice(2))

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
      error: (msg: Error | string): never => {
        console.error(msg instanceof Error ? msg.message : msg)
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

  if (error instanceof CLIError) {
    console.error(error.message)
    process.exit(error.oclif.exit ?? 2)
  }

  // Clean message for unknown flags instead of a raw stack trace
  if (
    error instanceof TypeError &&
    'code' in error &&
    error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
  ) {
    console.error(error.message)
    console.error(`Run "${getCreateCommand()} --help" for available options.`)
    process.exit(2)
  }

  console.error(error)
  process.exit(1)
}
