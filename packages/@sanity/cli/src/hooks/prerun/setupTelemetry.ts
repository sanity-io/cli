import {type Hook} from '@oclif/core'

import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'
import {type CLITraceData} from '../../telemetry/cli.telemetry.js'
import {TelemetryStore} from '../../telemetry/TelemetryStore.js'
import {detectRuntime} from '../../util/detectRuntime.js'
import {parseArguments} from '../../util/parseArguments.js'

export const setupTelemetry: Hook.Prerun = async function ({argv, Command, config, context}) {
  // Show telemetry disclosure
  telemetryDisclosure()

  const telemetryStore = await TelemetryStore.getInstance()
  const telemetry = telemetryStore.getLogger()
  const cliConfig = telemetryStore.getCliConfig()

  telemetry.updateUserProperties({
    cliVersion: config.version,
    cpuArchitecture: process.arch,
    dataset: cliConfig?.api?.dataset,
    machinePlatform: process.platform,
    projectId: cliConfig?.api?.projectId,
    runtime: detectRuntime(),
    runtimeVersion: process.version,
  })

  const args = parseArguments()

  const traceOptions: CLITraceData = {
    commandArguments: args.argsWithoutOptions,
    coreOptions: {
      debug: args.coreOptions.debug ?? undefined,
      help: args.coreOptions.help ?? undefined,
      version: args.coreOptions.version ?? undefined,
    },
    extraArguments: args.extraArguments,
    groupOrCommand: args.groupOrCommand,
  }

  telemetryDebug('Starting command trace', traceOptions)

  // Start the command trace
  const trace = telemetryStore._startCommandTrace(traceOptions)
  config.telemetry = trace
  telemetryStore._setContext(args.groupOrCommand)
}
