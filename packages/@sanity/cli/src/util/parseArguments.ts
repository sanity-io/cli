import {type Interfaces} from '@oclif/core'

import {collectTelemetryFlags, type CommandTelemetry} from './telemetry/commandTelemetry.js'

interface TelemetryCommand {
  baseFlags?: Interfaces.FlagInput
  flags?: Interfaces.FlagInput
  id?: string
  telemetry?: CommandTelemetry
}

/** Collect telemetry without retaining positional input or forwarded arguments. */
export function parseArguments(argv: string[], command?: TelemetryCommand) {
  const [groupOrCommand = 'unknown', ...argsWithoutOptions] = command?.id?.split(':') ?? []

  return {
    argsWithoutOptions,
    coreOptions: {
      debug: Boolean(process.env.DEBUG),
      help: command?.id === 'help',
      version: command?.id === 'version',
    },
    extraArguments: collectTelemetryFlags(
      argv.slice(2),
      {...command?.baseFlags, ...command?.flags},
      command?.telemetry,
    ),
    groupOrCommand,
  }
}
