import {rm} from 'node:fs/promises'

import {type TelemetryEvent} from '@sanity/telemetry'
import {catchError, defer, from, lastValueFrom, mergeMap, of, reduce, switchMap, tap} from 'rxjs'

import {type ConsentInformation} from '../../actions/telemetry/types.js'
import {readNDJSON} from '../utils/readNDJSON.js'
import {cleanupOldTelemetryFiles} from './cleanupOldTelemetryFiles.js'
import {telemetryStoreDebug} from './debug.js'
import {findTelemetryFiles} from './findTelemetryFiles.js'

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
      // of() is not same as of(undefined) in rxjs
      // eslint-disable-next-line unicorn/no-useless-undefined
      switchMap(() => of(undefined)),
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
            return of({allEvents: [], consent: currentConsent, filesToDelete: []})
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
                switchMap((events) => of({events, filePath: events.length > 0 ? filePath : ''})),
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
            switchMap((result) => of({...result, consent: currentConsent})),
          )
        }),
      )
    }),
    switchMap(({allEvents, consent, filesToDelete}) => {
      telemetryStoreDebug(
        'Found %d total events to flush from %d files',
        allEvents.length,
        filesToDelete.length,
      )

      if (consent.status !== 'granted' || allEvents.length === 0) {
        if (consent.status === 'granted') {
          telemetryStoreDebug('No events to send, cleaning up empty files')
          return deleteFiles(filesToDelete, 'empty files')
        } else {
          telemetryStoreDebug(
            'Consent not granted (%s), cleaning up %d files without sending events',
            consent.status,
            filesToDelete.length,
          )
          return deleteFiles(filesToDelete, `without sending (consent: ${consent.status})`)
        }
      }

      // Send events and then delete files
      telemetryStoreDebug('Sending %d events to backend', allEvents.length)

      return defer(() => from(options.sendEvents(allEvents))).pipe(
        tap(() => {
          telemetryStoreDebug('Successfully sent events, deleting %d files', filesToDelete.length)
        }),
        switchMap(() => deleteFiles(filesToDelete, 'after successful send')),
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
