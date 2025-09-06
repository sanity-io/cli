import {type Hook} from '@oclif/core'

import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'

export const setupTelemetry: Hook.Prerun = async function ({config: _config}) {
  // Show telemetry disclosure
  telemetryDisclosure()

  // const telemetryStore = await TelemetryStore.getInstance()
  // const telemetry = telemetryStore.getLogger()
  // const cliConfig = telemetryStore.getCliConfig()

  // telemetry.updateUserProperties({
  //   cliVersion: config.version,
  //   cpuArchitecture: process.arch,
  //   dataset: cliConfig?.api?.dataset,
  //   machinePlatform: process.platform,
  //   projectId: cliConfig?.api?.projectId,
  //   runtime: detectRuntime(),
  //   runtimeVersion: process.version,
  // })

  // const args = parseArguments()

  // const traceOptions: CLITraceData = {
  //   commandArguments: args.argsWithoutOptions,
  //   coreOptions: {
  //     debug: args.coreOptions.debug ?? undefined,
  //     help: args.coreOptions.help ?? undefined,
  //     version: args.coreOptions.version ?? undefined,
  //   },
  //   extraArguments: args.extraArguments,
  //   groupOrCommand: args.groupOrCommand,
  // }

  // telemetryDebug('Starting command trace', traceOptions)

  // // Start the command trace
  // telemetryStore._startCommandTrace(traceOptions)
  // // TODO: Fix config type augmentation for telemetry property
  // // config.telemetry = _trace
  // telemetryStore._setContext(args.groupOrCommand)
}
