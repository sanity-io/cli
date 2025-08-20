import {defineTrace} from '@sanity/telemetry'

export interface CLITraceData {
  /**
   * Command arguments, eg any arguments after `sanity <command>` (no flags)
   */
  commandArguments: string[]

  coreOptions: {
    debug?: boolean
    help?: boolean
    version?: boolean
  }

  /**
   * Arguments after the ended argument list (--)
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
  version: 1,
})
