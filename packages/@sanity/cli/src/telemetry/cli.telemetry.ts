import {defineTrace} from '@sanity/telemetry'

export interface CLITraceData {
  /**
   * Resolved subcommand names, excluding positional user input
   */
  commandArguments: string[]

  coreOptions: {
    debug?: boolean
    help?: boolean
    version?: boolean
  }

  /**
   * Recognized flags, with sensitive values and forwarded arguments omitted
   */
  extraArguments: string[]
  /**
   * Command flags, without the core options (help, debug, version etc)
   */
  groupOrCommand: string
}

export const CliCommandTelemetry = defineTrace<CLITraceData>({
  description: 'A CLI command was executed',
  name: 'CLI Command Executed',
  version: 2,
})
