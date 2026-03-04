import {rm} from 'node:fs/promises'

import {type ConsentInformation} from '@sanity/cli-core'
import {type TelemetryEvent} from '@sanity/telemetry'
import {catchError, defer, from, lastValueFrom, mergeMap, of, reduce, switchMap, tap} from 'rxjs'

import {cleanupOldTelemetryFiles} from './cleanupOldTelemetryFiles.js'
import {findTelemetryFiles} from './findTelemetryFiles.js'
import {readNDJSON} from './readNDJSON.js'
import {telemetryStoreDebug} from './telemetryStoreDebug.js'

interface FlushTelemetryFilesOptions {
  resolveConsent: () => Promise<ConsentInformation>
  sendEvents: (events: TelemetryEvent[]) => Promise<void>
}

/**
 * Standalone, stateless function to flush telemetry files.
 *
 * This function can be used independently of the telemetry store, making it
 * suitable for use in child processes or other contexts where store state
 * is not available.
 *
 * @param options - Configuration for consent resolution and event sending
 * @returns Promise that resolves when flush operation is complete
 *
 * @internal
 */
export async function flushTelemetryFiles(options: FlushTelemetryFilesOptions): Promise<void> {
  telemetryStoreDebug('Starting standalone flush operation')

  // Helper function for deleting files with consistent error handling
  const deleteFiles = (files: string[], reason: string) => {
    if (files.length === 0) {
      // of() is not same as of(undefined) in rxjs
      // eslint-disable-next-line unicorn/no-useless-undefined
      return of(undefined)
    }

    return from(files).pipe(
      mergeMap((filePath) =>
        from(rm(filePath, {force: true})).pipe(
          tap(() => {
            telemetryStoreDebug(`Deleted file ${reason}: %s`, filePath)
          }),
          catchError((error) => {
            telemetryStoreDebug('Error deleting file %s: %o', filePath, error)
            // of() is not same as of(undefined) in rxjs
            // eslint-disable-next-line unicorn/no-useless-undefined
            return of(undefined)
          }),
        ),
      ),
      // Collect all deletions into a single completion value
      reduce(() => undefined as void, undefined as void),
    )
  }

  const flush$ = defer(() => from(options.resolveConsent())).pipe(
    tap((currentConsent) => {
      telemetryStoreDebug('Current consent status for flush: %s', currentConsent.status)
    }),
    switchMap((currentConsent) => {
      // First cleanup old files, then process current files
      return defer(() => from(cleanupOldTelemetryFiles())).pipe(
        switchMap(() => defer(() => from(findTelemetryFiles()))),
        switchMap((filePaths) => {
          if (filePaths.length === 0) {
            telemetryStoreDebug('No telemetry files found, nothing to flush')
            return of({allEvents: [], consent: currentConsent, emptyFiles: [], filesToDelete: []})
          }

          telemetryStoreDebug('Found %d telemetry files to process', filePaths.length)

          return from(filePaths).pipe(
            mergeMap((filePath) => {
              return defer(() => from(readNDJSON<TelemetryEvent>(filePath))).pipe(
                tap((events) => {
                  telemetryStoreDebug('Read %d events from %s', events.length, filePath)
                }),
                catchError((error) => {
                  if ((error as {code?: string}).code === 'ENOENT') {
                    telemetryStoreDebug('File %s no longer exists, skipping', filePath)
                    return of([])
                  }
                  telemetryStoreDebug('Error reading file %s: %o', filePath, error)
                  return of([])
                }),
                switchMap((events) => of({events, filePath})),
              )
            }),
            reduce(
              (
                acc: {allEvents: TelemetryEvent[]; emptyFiles: string[]; filesToDelete: string[]},
                current,
              ) => {
                if (current.events.length > 0) {
                  acc.allEvents.push(...current.events)
                  acc.filesToDelete.push(current.filePath)
                } else {
                  acc.emptyFiles.push(current.filePath)
                }
                return acc
              },
              {allEvents: [], emptyFiles: [], filesToDelete: []},
            ),
            switchMap((result) => of({...result, consent: currentConsent})),
          )
        }),
      )
    }),
    switchMap(({allEvents, consent, emptyFiles, filesToDelete}) => {
      telemetryStoreDebug(
        'Found %d total events to flush from %d files (%d empty)',
        allEvents.length,
        filesToDelete.length,
        emptyFiles.length,
      )

      // Always clean up empty files regardless of consent or event count
      const cleanupEmpty$ =
        emptyFiles.length > 0 ? deleteFiles(emptyFiles, 'empty files') : of(undefined as void)

      if (consent.status !== 'granted' || allEvents.length === 0) {
        if (consent.status === 'granted') {
          telemetryStoreDebug('No events to send, cleaning up files')
          return cleanupEmpty$
        } else {
          telemetryStoreDebug(
            'Consent not granted (%s), cleaning up %d files without sending events',
            consent.status,
            filesToDelete.length,
          )
          return deleteFiles(
            [...filesToDelete, ...emptyFiles],
            `without sending (consent: ${consent.status})`,
          )
        }
      }

      // Send events and then delete all files (including empty ones)
      telemetryStoreDebug('Sending %d events to backend', allEvents.length)

      return defer(() => from(options.sendEvents(allEvents))).pipe(
        tap(() => {
          telemetryStoreDebug('Successfully sent events, deleting %d files', filesToDelete.length)
        }),
        switchMap(() =>
          deleteFiles([...filesToDelete, ...emptyFiles], 'after successful send'),
        ),
      )
    }),
    tap(() => {
      telemetryStoreDebug('Standalone flush operation completed successfully')
    }),
    switchMap(() => of(undefined as void)),
    catchError((error) => {
      telemetryStoreDebug('Error during standalone flush operation: %o', error)
      throw error
    }),
  )

  return lastValueFrom(flush$)
}
