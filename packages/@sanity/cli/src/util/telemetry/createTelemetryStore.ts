import {appendFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'

import {
  type CLITelemetryStore,
  type ConsentInformation,
  type TelemetryUserProperties,
} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'

import {generateTelemetryFilePath} from './generateTelemetryFilePath.js'
import {createLogger} from './logger.js'
import {telemetryStoreDebug} from './telemetryStoreDebug.js'

/**
 * FILE MANAGEMENT STRATEGY:
 *
 * The telemetry system uses a multi-file approach to handle concurrent CLI processes:
 *
 * 1. WRITING (per session):
 *    - Each CLI session gets a unique file: telemetry-\{hash\}-\{env\}-\{sessionId\}.ndjson
 *    - Prevents write conflicts when multiple CLI commands run simultaneously
 *    - Events are written using an RxJS queue for ordered processing with retry logic
 *
 * 2. FLUSHING (aggregate all sessions):
 *    - findTelemetryFiles() discovers ALL telemetry files for user/environment
 *    - Events are collected from all session files and sent as a batch
 *    - Files are deleted after successful transmission
 *
 * 3. CLEANUP (background maintenance):
 *    - cleanupOldTelemetryFiles() removes stale files older than 7 days
 *    - Prevents disk space accumulation from abandoned sessions
 */

interface CreateTelemetryStoreOptions {
  resolveConsent: () => Promise<ConsentInformation>
}

/**
 * Creates a file-based telemetry store with cached consent and reliable synchronous I/O.
 *
 * Key optimizations:
 * - Consent resolved once at creation and cached (vs checking on every emit)
 * - File path generated and directory created once during initialization
 * - Synchronous file writes to ensure events are captured even during process exit
 *
 * @param sessionId - Unique session identifier for file isolation
 * @param options - Configuration options
 * @returns TelemetryStore instance compatible with the telemetry interface
 *
 * @internal
 */
export function createTelemetryStore(
  sessionId: string,
  options: CreateTelemetryStoreOptions,
): CLITelemetryStore {
  telemetryStoreDebug('Creating telemetry store with sessionId: %s', sessionId)

  let cachedConsent: ConsentInformation | null = null
  let filePath: string | null = null

  const initializeConsent = async () => {
    if (cachedConsent) return

    try {
      cachedConsent = await options.resolveConsent()
      telemetryStoreDebug('Cached consent status: %s', cachedConsent.status)
    } catch (error) {
      telemetryStoreDebug('Failed to initialize consent, treating as undetermined: %o', error)
      cachedConsent = {reason: 'fetchError', status: 'undetermined'}
    }
  }

  const initializeFilePath = async () => {
    if (filePath) return

    try {
      filePath = await generateTelemetryFilePath(sessionId)
      telemetryStoreDebug('Generated file path: %s', filePath)

      await mkdir(dirname(filePath), {recursive: true})
      telemetryStoreDebug('Created directory structure for: %s', filePath)
    } catch (error) {
      telemetryStoreDebug('Failed to initialize file path: %o', error)
      filePath = null
    }
  }

  const emit = (event: TelemetryEvent) => {
    if (!cachedConsent || cachedConsent.status !== 'granted') {
      if (cachedConsent) {
        telemetryStoreDebug(
          'Cached consent not granted (%s), skipping event: %s',
          cachedConsent.status,
          event.type,
        )
      } else {
        telemetryStoreDebug('Consent not resolved, skipping event: %s', event.type)
      }
      return
    }

    if (!filePath) {
      telemetryStoreDebug('File path not initialized, skipping event: %s', event.type)
      return
    }

    telemetryStoreDebug('Emitting event: %s', event.type)

    try {
      const eventLine = JSON.stringify(event) + '\n'

      // We use synchronous file writes to ensure telemetry events are captured even when
      // the process exits abruptly (process.exit, uncaught exceptions, SIGTERM, etc.).
      // The performance impact is probably negligible and is worth the trade-off
      // for 100% reliability. Async writes would be lost when the event loop
      // shuts down during process exit.
      appendFileSync(filePath, eventLine, 'utf8')
      telemetryStoreDebug('Successfully wrote event to file: %s', filePath)
    } catch (error) {
      telemetryStoreDebug('Failed to write telemetry event: %o', error)
      // Silent failure - don't break CLI functionality
    }
  }

  const logger = createLogger<TelemetryUserProperties>(sessionId, emit)

  // Initialize both consent and file path concurrently
  Promise.allSettled([initializeConsent(), initializeFilePath()]).then((results) => {
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        const type = index === 0 ? 'consent' : 'file path'
        telemetryStoreDebug('Error initializing %s: %o', type, result.reason)
      }
    }
  })

  return logger
}
