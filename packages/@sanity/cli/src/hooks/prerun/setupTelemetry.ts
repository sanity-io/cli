import {appendFile} from 'node:fs/promises'

import {type Hook, ux} from '@oclif/core'
import {findProjectRoot, getCliConfig, getGlobalCliClient, isTrueish} from '@sanity/cli-core'
import {createSessionId} from '@sanity/telemetry'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {telemetryDebug} from '../../actions/telemetry/telemetryDebug.js'
import {telemetryDisclosure} from '../../actions/telemetry/telemetryDisclosure.js'
import {CliCommandTelemetry, type CLITraceData} from '../../telemetry/cli.telemetry.js'
import {createTelemetryStore} from '../../telemetry/store/createTelemetryStore.js'
import {detectRuntime} from '../../util/detectRuntime.js'
import {parseArguments} from '../../util/parseArguments.js'

const LOG_FILE_NAME = 'telemetry-events.ndjson'

export const setupTelemetry: Hook.Prerun = async function ({config}) {
  // Show telemetry disclosure
  telemetryDisclosure()

  const sessionId = createSessionId()

  const store = createTelemetryStore(sessionId, {
    resolveConsent,
    sendEvents: async (batch) => {
      const inspectEvents = isTrueish(process.env.SANITY_TELEMETRY_INSPECT)
      if (inspectEvents) {
        ux.stdout(`SANITY_TELEMETRY_INSPECT is set, appending events to "${LOG_FILE_NAME}"`)
        await appendFile(
          LOG_FILE_NAME,
          `${batch.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
        )
      }

      telemetryDebug('Submitting %s telemetry events', batch.length)

      const client = await getGlobalCliClient({
        apiVersion: '2023-12-18',
        requireUser: true,
      })

      try {
        return await client.request({
          body: {batch, projectId: cliConfig.api?.projectId},
          json: true,
          method: 'POST',
          uri: '/intake/batch',
        })
      } catch (err) {
        const statusCode = err.response && err.response.statusCode
        telemetryDebug(
          'Failed to send telemetry events%s: %s',
          statusCode ? ` (HTTP ${statusCode})` : '',
          err.stack,
        )
        // note: we want to throw - the telemetry store implements error handling already
        throw err
      }
    },
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

  // TODO: Change to exit
  process.once('beforeExit', () => {
    // TODO: Fix this implementation, it is not complete
    cliCommandTrace.complete()

    store.end()
  })
}
