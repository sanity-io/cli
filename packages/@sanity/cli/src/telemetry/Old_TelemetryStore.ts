import {appendFile} from 'node:fs/promises'

import {ux} from '@oclif/core'
import {
  type CliConfig,
  findProjectRoot,
  getCliConfig,
  getCliToken,
  getGlobalCliClient,
  isHttpError,
  isTrueish,
} from '@sanity/cli-core'
import {
  createBatchedStore,
  createSessionId,
  type DefinedTelemetryTrace,
  type TelemetryStore as SanityTelemetryStore,
  type TelemetryEvent,
  type TelemetryLogger,
  type TelemetryTrace,
} from '@sanity/telemetry'

import {resolveConsent} from '../actions/telemetry/resolveConsent.js'
import {telemetryDebug} from '../actions/telemetry/telemetryDebug.js'
import {CliCommandTelemetry, type CLITraceData} from './cli.telemetry.js'
import {type UserProperties} from './old_types.js'

const LOG_FILE_NAME = 'telemetry-events.ndjson'

export class TelemetryStore {
  private static instance: TelemetryStore | null = null
  private _commandTrace: TelemetryTrace<UserProperties, CLITraceData> | undefined
  private _telemetryContext: TelemetryLogger<UserProperties> | undefined
  private cliConfig: CliConfig | undefined
  private telemetryStore: SanityTelemetryStore<UserProperties>

  private constructor() {
    const sessionId = createSessionId()
    telemetryDebug('session id: %s', sessionId)

    const store = createBatchedStore<UserProperties>(sessionId, {
      resolveConsent: () => resolveConsent({env: process.env}),
      sendEvents: this.sendEvents,
    })

    this.telemetryStore = store

    process.once('SIGINT', () => store.flush().finally(() => process.exit(0)))
    process.once('beforeExit', () => store.flush())
    process.once('unhandledRejection', () => store.flush())
    process.once('uncaughtException', () => store.flush())
  }

  static async getInstance(): Promise<TelemetryStore> {
    if (!TelemetryStore.instance) {
      TelemetryStore.instance = new TelemetryStore()
      await TelemetryStore.instance.initialize()
    }
    return TelemetryStore.instance
  }

  /**
   * Complete a command trace, this is internally used by the framework.
   * Do not use this method directly.
   *
   * @internal
   */
  public _completeCommandTrace(): void {
    this._commandTrace?.complete()
    this._commandTrace = undefined
  }

  /**
   * Set the context for the command trace, this is internally used by the framework.
   * Do not use this method directly.
   *
   * @param context - The context
   * @internal
   */
  public _setContext(context: string): void {
    this._telemetryContext = this._commandTrace?.newContext(context)
  }

  /**
   * Start a command trace, this is internally used by the framework.
   * Do not use this method directly.
   *
   * @param traceData - The trace data
   * @internal
   */
  public _startCommandTrace(traceData: CLITraceData): TelemetryTrace<UserProperties, CLITraceData> {
    const trace = this.telemetryStore.logger.trace(CliCommandTelemetry, traceData)
    this._commandTrace = trace

    return trace
  }

  public getCliConfig(): CliConfig | undefined {
    return this.cliConfig
  }

  getLogger(): SanityTelemetryStore<UserProperties>['logger'] {
    return this.telemetryStore.logger
  }

  public trace<Data = void, Context = unknown>(
    event: DefinedTelemetryTrace<Data, void>,
    context: Context,
  ) {
    this._telemetryContext?.trace(event, context)
  }

  private createTelemetryClient() {
    return getGlobalCliClient({
      apiVersion: 'v2025-08-19',
      requireUser: false,
    })
  }

  private async initialize(): Promise<void> {
    const projectRoot = await findProjectRoot(process.cwd())
    this.cliConfig = await getCliConfig(projectRoot.directory)
  }

  private async sendEvents(batch: TelemetryEvent[]) {
    const token = getCliToken()
    if (!token) {
      // Note: since the telemetry store checks for consent before sending events, and this token
      // check is also done during consent checking, this would normally never happen
      telemetryDebug('No user token found. Something is not quite right')
      throw new Error('User is not logged in')
    }

    const inspectEvents = isTrueish(process.env.SANITY_TELEMETRY_INSPECT)
    if (inspectEvents) {
      ux.stdout(`SANITY_TELEMETRY_INSPECT is set, appending events to "${LOG_FILE_NAME}"`)
      await appendFile(LOG_FILE_NAME, `${batch.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
    }

    const client = await this.createTelemetryClient()
    telemetryDebug('Submitting %s telemetry events', batch.length)

    const projectId = this.cliConfig?.api?.projectId

    try {
      return await client.request({
        body: {batch, projectId},
        json: true,
        method: 'POST',
        uri: '/intake/batch',
      })
    } catch (error) {
      if (isHttpError(error)) {
        const statusCode = error.response && error.response.statusCode
        telemetryDebug(
          'Failed to send telemetry events%s: %s',
          statusCode ? ` (HTTP ${statusCode})` : '',
          error,
        )
      } else {
        telemetryDebug('Failed to submit telemetry events: %o', error)
      }

      // note: we want to throw - the telemetry store implements error handling already
      throw error
    }
  }
}
