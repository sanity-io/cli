import {fileURLToPath} from 'node:url'

import {type Hook} from '@oclif/core'
import {findProjectRoot, getCliConfig} from '@sanity/cli-core'
import {createSessionId} from '@sanity/telemetry'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'
import {CliCommandTelemetry, type CLITraceData} from '../../telemetry/cli.telemetry.js'
import {createTelemetryStore} from '../../telemetry/store/createTelemetryStore.js'
import {detectRuntime} from '../../util/detectRuntime.js'
import {parseArguments} from '../../util/parseArguments.js'

export const setupTelemetry: Hook.Prerun = async function ({config}) {
  // Show telemetry disclosure
  telemetryDisclosure()

  const sessionId = createSessionId()

  const store = createTelemetryStore(sessionId, {
    resolveConsent,
  })

  const projectRoot = await findProjectRoot(process.cwd())
  const cliConfig = await getCliConfig(projectRoot.directory)

  store.logger.updateUserProperties({
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

  const cliCommandTrace = store.logger.trace(CliCommandTelemetry, traceOptions)
  cliCommandTrace.start()

  // Handle process exit - complete trace and spawn worker to flush all telemetry
  process.once('exit', (status) => {
    console.log('exit', status)
    // Spawn detached worker to flush all telemetry files
    const workerPath = fileURLToPath(new URL('flushTelemetry.worker.js', import.meta.url))

    telemetryDebug(`Spawning "${process.execPath} ${workerPath}"`)
    cliCommandTrace.complete()

    // spawn(process.execPath, [workerPath], {
    //   detached: true,
    //   env: {
    //     ...process.env,
    //     SANITY_TELEMETRY_DATASET: cliConfig?.api?.dataset || '',
    //     SANITY_TELEMETRY_PROJECT_ID: cliConfig?.api?.projectId || '',
    //   },
    //   stdio: process.env.SANITY_TELEMETRY_INSPECT ? 'inherit' : 'ignore',
    // }).unref()
  })
}
