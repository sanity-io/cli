import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

import {type Hook} from '@oclif/core'
import {
  type CliConfig,
  debug,
  findProjectRoot,
  getCliConfig,
  setCliTelemetry,
} from '@sanity/cli-core'
import {createSessionId} from '@sanity/telemetry'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'
import {CliCommandTelemetry, type CLITraceData} from '../../telemetry/cli.telemetry.js'
import {detectRuntime} from '../../util/detectRuntime.js'
import {parseArguments} from '../../util/parseArguments.js'
import {createTelemetryStore} from '../../util/telemetry/createTelemetryStore.js'

export const setupTelemetry: Hook.Prerun = async function ({config}) {
  // Show telemetry disclosure
  telemetryDisclosure()

  const sessionId = createSessionId()

  const telemetry = createTelemetryStore(sessionId, {
    resolveConsent,
  })

  let cliConfig: CliConfig | undefined
  try {
    const projectRoot = await findProjectRoot(process.cwd())
    cliConfig = await getCliConfig(projectRoot.directory)
  } catch {
    // Accept not finding a project root and/or CLI config
  }

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

  const cliCommandTrace = telemetry.trace(CliCommandTelemetry, traceOptions)
  cliCommandTrace.start()

  // Set the global telemetry store with new context
  setCliTelemetry(cliCommandTrace.newContext(args.groupOrCommand))

  // Handle process exit - complete trace and spawn worker to flush all telemetry
  process.once('exit', (status) => {
    if (status === 0) {
      cliCommandTrace.complete()
    } else {
      // TODO: Properly handle errors
      // https://oclif.io/docs/error_handling/#error-handling-in-the-catch-method
      cliCommandTrace.error(new Error('Process exited with status ' + status))
    }

    const workerPath = fileURLToPath(new URL('flushTelemetry.worker.js', import.meta.url))
    telemetryDebug(`Spawning "${process.execPath} ${workerPath}"`)

    // Spawn detached worker to flush all telemetry files
    // unref will ensure the child process can keep doing work even after the parent process exits
    spawn(process.execPath, [workerPath], {
      detached: true,
      env: {
        ...process.env,
        SANITY_TELEMETRY_PROJECT_ID: cliConfig?.api?.projectId || '',
      },
      // If debug is enabled, spawn the worker with stdio inherit to see the output
      stdio: debug.enabled ? 'inherit' : 'ignore',
    }).unref()
  })
}
