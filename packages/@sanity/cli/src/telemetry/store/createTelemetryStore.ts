import {appendFile, mkdir, rm} from 'node:fs/promises'
import {dirname} from 'node:path'

import {type TelemetryEvent, type TelemetryStore} from '@sanity/telemetry'
import {
  catchError,
  concatMap,
  from,
  lastValueFrom,
  mergeMap,
  of,
  reduce,
  retry,
  Subject,
  type Subscription,
  switchMap,
  tap,
} from 'rxjs'

import {type ConsentInformation} from '../../actions/telemetry/types.js'
import {readNDJSON} from '../utils/readNDJSON.js'
import {cleanupOldTelemetryFiles} from './cleanupOldTelemetryFiles.js'
import {telemetryStoreDebug} from './debug.js'
import {findTelemetryFiles} from './findTelemetryFiles.js'
import {generateTelemetryFilePath} from './generateTelemetryFilePath.js'
import {createLogger} from './logger.js'

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
  sendEvents: (events: TelemetryEvent[]) => Promise<void>
}

/**
 * Creates a file-based telemetry store with cached consent and non-blocking async I/O.
 *
 * Key optimizations:
 * - Consent resolved once at creation and cached (vs checking on every emit)
 * - File path generated and directory created once during initialization
 * - Non-blocking file operations to prevent event loop blocking
 * - RxJS event queue for ordered processing with backpressure handling and retry logic
 *
 * @param sessionId - Unique session identifier for file isolation
 * @param options - Configuration options
 * @returns TelemetryStore instance compatible with the telemetry interface
 */
export function createTelemetryStore<UserProperties>(
  sessionId: string,
  options: CreateTelemetryStoreOptions,
): TelemetryStore<UserProperties> {
  telemetryStoreDebug('Creating telemetry store with sessionId: %s', sessionId)

  let cachedConsent: ConsentInformation | null = null
  let filePath: string | null = null

  // Event queue for ordered, backpressure-safe writing
  const eventQueue$ = new Subject<TelemetryEvent>()
  let eventSubscription: Subscription | null = null

  // Set up the event processing pipeline once filePath is available
  const initializeEventProcessing = () => {
    if (!filePath || eventSubscription) return

    eventSubscription = eventQueue$
      .pipe(
        concatMap((event) => {
          const eventLine = JSON.stringify(event) + '\n'

          return from(appendFile(filePath as string, eventLine, 'utf8')).pipe(
            tap(() => {
              telemetryStoreDebug('Successfully wrote event to file: %s', filePath)
            }),
            retry({count: 2, delay: 100}),
            catchError((error) => {
              telemetryStoreDebug('Failed to write telemetry event: %o', error)
              return of(null)
            }),
          )
        }),
      )
      .subscribe()

    telemetryStoreDebug('Event processing pipeline initialized for: %s', filePath)
  }

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

      // Initialize event processing pipeline now that filePath is available
      initializeEventProcessing()
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

    // Queue event for ordered processing
    eventQueue$.next(event)
  }

  // Helper function for deleting files with consistent error handling
  const deleteFiles = (files: string[], reason: string) => {
    if (files.length === 0) {
      return of(null) // Ensure stream emits at least one value
    }

    return from(files).pipe(
      mergeMap((filePath) =>
        from(rm(filePath, {force: true})).pipe(
          tap(() => {
            telemetryStoreDebug(`Deleted file ${reason}: %s`, filePath)
          }),
          catchError((error) => {
            telemetryStoreDebug('Error deleting file %s: %o', filePath, error)
            return of(null)
          }),
        ),
      ),
    )
  }

  const flush = async (): Promise<void> => {
    telemetryStoreDebug('Starting flush operation for sessionId: %s', sessionId)

    const currentConsent = await options.resolveConsent()
    telemetryStoreDebug('Current consent status for flush: %s', currentConsent.status)

    await cleanupOldTelemetryFiles()

    const flush$ = from(findTelemetryFiles()).pipe(
      switchMap((filePaths) => {
        if (filePaths.length === 0) {
          telemetryStoreDebug('No telemetry files found, nothing to flush')
          return of({allEvents: [], filesToDelete: []})
        }

        telemetryStoreDebug('Found %d telemetry files to process', filePaths.length)

        return from(filePaths).pipe(
          mergeMap((filePath) => {
            return from(
              (async () => {
                try {
                  telemetryStoreDebug('Reading events from file: %s', filePath)
                  const events = await readNDJSON<TelemetryEvent>(filePath)
                  telemetryStoreDebug('Read %d events from %s', events.length, filePath)
                  return {events, filePath}
                } catch (error) {
                  if ((error as {code?: string}).code === 'ENOENT') {
                    telemetryStoreDebug('File %s no longer exists, skipping', filePath)
                    return {events: [], filePath: ''}
                  }
                  telemetryStoreDebug('Error reading file %s: %o', filePath, error)
                  return {events: [], filePath: ''}
                }
              })(),
            )
          }),
          reduce(
            (acc: {allEvents: TelemetryEvent[]; filesToDelete: string[]}, current) => {
              if (current.filePath) {
                acc.allEvents.push(...current.events)
                acc.filesToDelete.push(current.filePath)
              }
              return acc
            },
            {allEvents: [], filesToDelete: []},
          ),
        )
      }),
      switchMap(({allEvents, filesToDelete}) => {
        telemetryStoreDebug(
          'Found %d total events to flush from %d files',
          allEvents.length,
          filesToDelete.length,
        )

        if (currentConsent.status !== 'granted' || allEvents.length === 0) {
          if (currentConsent.status === 'granted') {
            telemetryStoreDebug('No events to send, cleaning up empty files')
            return deleteFiles(filesToDelete, 'empty files')
          } else {
            telemetryStoreDebug(
              'Consent not granted (%s), cleaning up %d files without sending events',
              currentConsent.status,
              filesToDelete.length,
            )
            return deleteFiles(filesToDelete, `without sending (consent: ${currentConsent.status})`)
          }
        }

        // Send events and then delete files
        telemetryStoreDebug('Sending %d events to backend', allEvents.length)

        return from(options.sendEvents(allEvents)).pipe(
          tap(() => {
            telemetryStoreDebug('Successfully sent events, deleting %d files', filesToDelete.length)
          }),
          switchMap(() => deleteFiles(filesToDelete, 'after successful send')),
        )
      }),
      catchError((error) => {
        telemetryStoreDebug('Error during flush operation: %o', error)
        throw error
      }),
    )

    await lastValueFrom(flush$)

    telemetryStoreDebug('Flush operation completed successfully')
  }

  const end = () => {
    // Flush events before cleanup to prevent data loss
    flush()
      .then(() => {
        telemetryStoreDebug('Flush completed before ending store for sessionId: %s', sessionId)
      })
      .catch((error) => {
        telemetryStoreDebug('Error during flush before ending store: %o', error)
      })
      .finally(() => {
        // Clean up event queue and subscription
        if (eventSubscription) {
          eventSubscription.unsubscribe()
          eventSubscription = null
        }
        eventQueue$.complete()
        telemetryStoreDebug('Telemetry store ended and cleaned up for sessionId: %s', sessionId)
      })
  }

  const logger = createLogger<UserProperties>(sessionId, emit)

  // Initialize both consent and file path concurrently
  Promise.allSettled([initializeConsent(), initializeFilePath()]).then((results) => {
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        const type = index === 0 ? 'consent' : 'file path'
        telemetryStoreDebug('Error initializing %s: %o', type, result.reason)
      }
    }
  })

  return {
    end,
    endWithBeacon: () => false,
    flush,
    logger,
  }
}
