import {dirname, isAbsolute, join, relative} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {watch as chokidarWatch, type FSWatcher} from 'chokidar'
import debounce from 'lodash-es/debounce.js'

import {formatSchemaValidation} from './formatSchemaValidation.js'
import {type ExtractOptions} from './getExtractOptions.js'
import {createSchemaPatternMatcher} from './matchSchemaPattern.js'
import {runSchemaExtraction} from './runSchemaExtraction.js'
import {schemasExtractDebug} from './utils/debug.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

/** Default glob patterns to watch for schema changes */
export const DEFAULT_WATCH_PATTERNS = [
  'sanity.config.{js,jsx,ts,tsx,mjs}',
  'schema*/**/*.{js,jsx,ts,tsx,mjs}',
]

/** Default patterns to ignore when watching */
const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/lib/**',
  '**/.sanity/**',
]

interface ExtractSchemaWatcherOptions {
  extractOptions: ExtractOptions
  output: Output
  watchPatterns: string[]

  onExtraction?: (result: {duration: number; success: boolean}) => void
}

interface ExtractSchemaWatcher {
  close: () => Promise<void>
  watcher: FSWatcher
}

/** State for tracking extraction status */
interface WatchState {
  isExtracting: boolean
  pendingExtraction: boolean
}

/** Return type for createExtractionRunner */
interface ExtractionRunner {
  runExtraction: () => Promise<void>
  state: WatchState
}

/**
 * Creates an extraction runner with concurrency control.
 * If extraction is already running, queues one more extraction to run after completion.
 * Multiple queued requests are coalesced into a single pending extraction.
 */
function createExtractionRunner(onExtract: () => Promise<void>): ExtractionRunner {
  const state: WatchState = {
    isExtracting: false,
    pendingExtraction: false,
  }

  async function runExtraction(): Promise<void> {
    if (state.isExtracting) {
      state.pendingExtraction = true
      return
    }

    state.isExtracting = true
    state.pendingExtraction = false

    try {
      await onExtract()
    } finally {
      state.isExtracting = false

      // If a change came in during extraction, run again
      if (state.pendingExtraction) {
        state.pendingExtraction = false
        await runExtraction()
      }
    }
  }

  return {runExtraction, state}
}

/**
 * Starts a schema watcher that extracts schema on file changes.
 * Returns a watcher instance and a stop function.
 */
export async function startExtractSchemaWatcher(
  options: ExtractSchemaWatcherOptions,
): Promise<ExtractSchemaWatcher> {
  const {extractOptions, onExtraction, output, watchPatterns} = options

  const {configPath, enforceRequiredFields, outputPath} = extractOptions
  const workDir = dirname(configPath)

  // Helper function to run extraction with spinner and error handling
  const runExtraction = async (): Promise<boolean> => {
    const spin = spinner(
      enforceRequiredFields
        ? 'Extracting schema with enforced required fields'
        : 'Extracting schema...',
    ).start()
    const extractionStartTime = Date.now()

    try {
      await runSchemaExtraction(extractOptions)

      spin.succeed(
        enforceRequiredFields
          ? `Extracted schema to ${outputPath} with enforced required fields`
          : `Extracted schema to ${outputPath}`,
      )

      const duration = Date.now() - extractionStartTime
      onExtraction?.({duration, success: true})

      return true
    } catch (err) {
      const duration = Date.now() - extractionStartTime
      onExtraction?.({duration, success: false})

      schemasExtractDebug('Failed to extract schema', err)
      spin.fail('Extraction failed')

      // Display validation errors if available
      if (err instanceof SchemaExtractionError && err.validation && err.validation.length > 0) {
        output.log('')
        output.log(formatSchemaValidation(err.validation))
      } else if (err instanceof Error) {
        output.error(err.message, {exit: 1})
      }

      return false
    }
  }

  // Run initial extraction
  await runExtraction()

  const absoluteWatchPatterns = watchPatterns.map((pattern) => join(workDir, pattern))

  // Create extraction runner with concurrency control
  const {runExtraction: runConcurrentExtraction} = createExtractionRunner(async () => {
    await runExtraction()
  })

  // Debounced extraction trigger (1 second delay)
  const debouncedExtract = debounce(() => {
    void runConcurrentExtraction()
  }, 1000)

  const {isMatch} = createSchemaPatternMatcher(watchPatterns)

  const watcher: FSWatcher = chokidarWatch(absoluteWatchPatterns, {
    cwd: workDir,
    ignored: IGNORED_PATTERNS,
    ignoreInitial: true,
  })

  watcher.on('all', (event, filePath) => {
    if (!isMatch(filePath, workDir)) {
      return
    }

    const timestamp = new Date().toLocaleTimeString()
    const relativePath = isAbsolute(filePath) ? relative(workDir, filePath) : filePath
    output.log(`[${timestamp}] ${event}: ${relativePath}`)
    debouncedExtract()
  })

  watcher.on('error', (err) => {
    output.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`)
  })

  return {
    close: () => watcher.close(),
    watcher,
  }
}
