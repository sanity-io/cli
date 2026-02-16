import {getCliTelemetry, Output, type ProjectRootResult} from '@sanity/cli-core'
import {mean, once} from 'lodash-es'

import {type ExtractSchemaCommand} from '../../commands/schema/extract.js'
import {SchemaExtractionWatchModeTrace} from '../../telemetry/extractSchema.telemetry.js'
import {DEFAULT_WATCH_PATTERNS, startExtractSchemaWatcher} from './extractSchemaWatcher.js'

interface WatchExtractSchemaOptions {
  flags: ExtractSchemaCommand['flags']
  output: Output
  projectRoot: ProjectRootResult
}

export async function watchExtractSchema(options: WatchExtractSchemaOptions): Promise<void> {
  const {flags, output, projectRoot} = options

  // Keep the start time + some simple stats for extractions as they happen
  const startTime = Date.now()
  const stats: {failedCount: number; successfulDurations: number[]} = {
    failedCount: 0,
    successfulDurations: [],
  }

  const additionalWatchPatterns = flags['watch-patterns'] ?? []
  const watchPatterns = [...DEFAULT_WATCH_PATTERNS, ...additionalWatchPatterns]

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
  const {stop} = await startExtractSchemaWatcher({
    flags,
    onExtraction: ({duration, success}) => {
      if (success) {
        stats.successfulDurations.push(duration)
      } else {
        stats.failedCount++
      }
    },
    output,
    projectRoot,
    watchPatterns,
  })

  trace.log({
    enforceRequiredFields: flags['enforce-required-fields'],
    schemaFormat: flags.format || 'groq-type-nodes',
    step: 'started',
  })

  output.log('')
  output.log('Watching for changes... (Ctrl+C to stop)')

  /**
   * Handle graceful shutdown.
   * Wrapped in once() to prevent it being called twice by SIGINT/SIGTERM callbacks.
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
    await stop()
    process.exit(0)
  })

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Watcher keeps process alive until cleanup is called
}
