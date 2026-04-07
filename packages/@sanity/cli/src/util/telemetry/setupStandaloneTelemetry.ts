import {type CLITelemetryStore, setCliTelemetry} from '@sanity/cli-core'
import {createSessionId} from '@sanity/telemetry'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {telemetryDisclosureStandalone} from '../../actions/telemetry/telemetryDisclosureStandalone.js'
import {sendEvents} from '../../services/telemetry.js'
import {CliCommandTelemetry, type CLITraceData} from '../../telemetry/cli.telemetry.js'
import {detectRuntime} from '../detectRuntime.js'
import {createTelemetryStore} from './createTelemetryStore.js'
import {flushTelemetryFiles} from './flushTelemetryFiles.js'

const DEFAULT_FLUSH_TIMEOUT_MS = 3000

interface SetupStandaloneTelemetryOptions {
  /** The command name being executed, e.g. "init" */
  commandName: string
  /** CLI version string */
  version: string

  /** CLI arguments (without flags), used for trace data */
  args?: string[]
  /** Timeout in ms for the inline telemetry flush. Defaults to 3000. */
  flushTimeoutMs?: number
}

interface StandaloneTelemetryResult {
  /** Call on successful completion to finalize the trace and flush telemetry */
  complete: () => Promise<void>
  /** Call on failure to record the error on the trace and flush telemetry */
  error: (err: Error) => Promise<void>
  /** The telemetry store, to pass to actions that need it */
  telemetry: CLITelemetryStore
}

/**
 * Sets up telemetry for non-oclif entry points (e.g. create-sanity).
 *
 * This mirrors the oclif prerun hook but:
 * - Does not depend on oclif
 * - Does not spawn a worker process for flushing
 * - Does not attempt to find/load a CLI config (create-sanity runs before a project exists)
 * - Flushes telemetry inline with a timeout via Promise.race
 *
 * @param options - Configuration for the standalone telemetry setup
 * @returns Object with the telemetry store and complete/error lifecycle functions
 *
 * @internal
 */
export function setupStandaloneTelemetry(
  options: SetupStandaloneTelemetryOptions,
): StandaloneTelemetryResult {
  const {args = [], commandName, flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS, version} = options

  telemetryDisclosureStandalone()

  const sessionId = createSessionId()
  const telemetry = createTelemetryStore(sessionId, {resolveConsent})

  telemetry.updateUserProperties({
    cliVersion: version,
    cpuArchitecture: process.arch,
    machinePlatform: process.platform,
    runtime: detectRuntime(),
    runtimeVersion: process.version,
  })

  const traceOptions: CLITraceData = {
    commandArguments: args,
    coreOptions: {},
    extraArguments: [],
    groupOrCommand: commandName,
  }

  telemetryDebug('Starting standalone command trace', traceOptions)

  const cliCommandTrace = telemetry.trace(CliCommandTelemetry, traceOptions)
  cliCommandTrace.start()

  const commandContext = cliCommandTrace.newContext(commandName)

  setCliTelemetry(commandContext, {
    reportTraceError: (err) => cliCommandTrace.error(err),
  })

  const flush = async (): Promise<void> => {
    telemetryDebug('Starting inline flush (timeout: %dms)', flushTimeoutMs)
    try {
      let timeoutHandle: ReturnType<typeof setTimeout>
      await Promise.race([
        flushTelemetryFiles({resolveConsent, sendEvents}),
        new Promise<void>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('flush timeout')), flushTimeoutMs)
        }),
      ]).finally(() => clearTimeout(timeoutHandle))
      telemetryDebug('Flush completed within timeout')
    } catch {
      telemetryDebug('Flush timed out or failed; files preserved for next CLI flush')
    }
  }

  return {
    complete: async () => {
      cliCommandTrace.complete()
      await flush()
    },
    error: async (err: Error) => {
      cliCommandTrace.error(err)
      await flush()
    },
    telemetry: commandContext,
  }
}
