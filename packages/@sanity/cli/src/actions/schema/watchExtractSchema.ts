import {getCliTelemetry, type Output} from '@sanity/cli-core'
import {mean, once} from 'lodash-es'

import {SchemaExtractionWatchModeTrace} from '../../telemetry/extractSchema.telemetry.js'
import {DEFAULT_WATCH_PATTERNS, startExtractSchemaWatcher} from './extractSchemaWatcher.js'
import {type ExtractOptions} from './getExtractOptions.js'

interface WatchExtractSchemaOptions {
  extractOptions: ExtractOptions
  output: Output
}

export async function watchExtractSchema(
  options: WatchExtractSchemaOptions,
): Promise<{close: () => Promise<void>}> {
  const {extractOptions, output} = options

  // Keep the start time + some simple stats for extractions as they happen
  const startTime = Date.now()
  const stats: {failedCount: number; successfulDurations: number[]} = {
    failedCount: 0,
    successfulDurations: [],
  }

  const watchPatterns = [...DEFAULT_WATCH_PATTERNS, ...extractOptions.watchPatterns]

  const trace = getCliTelemetry().trace(SchemaExtractionWatchModeTrace)
  trace.start()

  // Print watch mode header and patterns at the very beginning
  output.log('Schema extraction watch mode')
  output.log('')
  output.log('Watching for changes in:')
  for (const pattern of watchPatterns) {
    output.log(`  - ${pattern}`)
  }
  output.log('')

  output.log('Running initial extraction...')

  // Start the watcher (includes initial extraction)
  const {close} = await startExtractSchemaWatcher({
    extractOptions,
    onExtraction: ({duration, success}) => {
      if (success) {
        stats.successfulDurations.push(duration)
      } else {
        stats.failedCount++
      }
    },
    output,
    watchPatterns,
  })

  trace.log({
    enforceRequiredFields: extractOptions.enforceRequiredFields,
    schemaFormat: extractOptions.format,
    step: 'started',
  })

  output.log('')
  output.log('Watching for changes... (Ctrl+C to stop)')

  /**
   * Cleanup function that logs telemetry and stops the watcher.
   * Wrapped in once() to prevent multiple calls.
   */
  const cleanup = once(async () => {
    trace.log({
      averageExtractionDuration: mean(stats.successfulDurations) || 0,
      extractionFailedCount: stats.failedCount,
      extractionSuccessfulCount: stats.successfulDurations.length,
      step: 'stopped',
      watcherDuration: Date.now() - startTime,
    })
    trace.complete()

    output.log('')
    output.log('Stopping watch mode...')
    await close()
  })

  // Return cleanup function for programmatic usage and testing
  // The CLI framework will handle SIGINT/SIGTERM
  return {close: cleanup}
}
