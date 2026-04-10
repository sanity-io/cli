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
import {setupStandaloneTelemetry} from '../../@sanity/cli/src/util/telemetry/setupStandaloneTelemetry.js'
import {getCreateCommand} from './createCommand.js'
import {FlagValidationError, parseInitArgs} from './parseArgs.js'
import {version} from './version.js'

// Parse args first — FlagValidationError and unknown flag TypeError are user-input
// errors that don't need telemetry. --help also exits here, mirroring oclif where
// --help is handled before the prerun hook (telemetry setup) fires.
let parsedArgs!: ReturnType<typeof parseInitArgs>
try {
  parsedArgs = parseInitArgs(process.argv.slice(2))
} catch (error) {
  if (error instanceof FlagValidationError) {
    console.error(error.message)
    process.exit(2)
  }

  if (
    error instanceof TypeError &&
    'code' in error &&
    error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
  ) {
    console.error(error.message)
    console.error(`Run "${getCreateCommand()} --help" for available options.`)
    process.exit(2)
  }

  throw error
}

const {
  complete,
  error: reportError,
  telemetry,
} = setupStandaloneTelemetry({
  args: parsedArgs.args.type ? [parsedArgs.args.type] : [],
  commandName: 'create-sanity',
  version,
})

try {
  const {args, flags} = parsedArgs

  // parseArgs returns Record<string, unknown>; the shape is guaranteed by initFlagDefs
  const initOptions = flagsToInitOptions(
    flags as unknown as InitCommandFlags,
    isInteractive(),
    args,
  )

  await initAction(initOptions, {
    output: {
      error: (msg: Error | string): never => {
        throw new InitError(msg instanceof Error ? msg.message : msg, 1)
      },
      log: console.log,
      warn: (msg: Error | string): Error | string => {
        console.warn(msg instanceof Error ? msg.message : msg)
        return msg
      },
    },
    telemetry,
    workDir: process.cwd(),
  })

  await complete()
} catch (error) {
  if (error instanceof InitError) {
    await reportError(error)
    if (error.message) {
      console.error(error.message)
    }
    process.exit(error.exitCode)
  }

  if (error instanceof CLIError) {
    await reportError(error)
    console.error(error.message)
    process.exit(error.oclif.exit ?? 2)
  }

  if (error instanceof Error) {
    await reportError(error)
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
}
