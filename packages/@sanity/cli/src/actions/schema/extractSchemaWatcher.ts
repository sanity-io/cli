import {mkdir, writeFile} from 'node:fs/promises'
import {isAbsolute, join, relative, resolve} from 'node:path'

import {type Output, type ProjectRootResult, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type extractSchema as extractSchemaInternal} from '@sanity/schema/_internal'
import {watch as chokidarWatch, type FSWatcher} from 'chokidar'
import {debounce} from 'lodash-es'
import {glob} from 'tinyglobby'

import {type ExtractSchemaCommand} from '../../commands/schema/extract.js'
import {formatSchemaValidation} from './formatSchemaValidation.js'
import {type ExtractSchemaWorkerData, type ExtractSchemaWorkerError} from './types.js'
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
  flags: ExtractSchemaCommand['flags']
  output: Output
  projectRoot: ProjectRootResult
  watchPatterns: string[]

  onExtraction?: (result: {duration: number; success: boolean}) => void
}

interface ExtractSchemaWorkerResult {
  schema: ReturnType<typeof extractSchemaInternal>
  type: 'success'
}

type ExtractSchemaWorkerMessage = ExtractSchemaWorkerError | ExtractSchemaWorkerResult

interface ExtractSchemaWatcher {
  stop: () => Promise<void>
  watcher: FSWatcher
}

const FILENAME = 'schema.json'

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
  const {flags, onExtraction, output, projectRoot, watchPatterns} = options

  const workDir = projectRoot.directory
  const {
    'enforce-required-fields': enforceRequiredFields,
    format,
    path,
    workspace: workspaceName,
  } = flags

  const outputDir = path ? resolve(join(workDir, path)) : workDir
  const outputPath = join(outputDir, FILENAME)

  // Helper function to run extraction with spinner and error handling
  const runExtraction = async (spinnerText: string, successText: string): Promise<boolean> => {
    const spin = spinner(spinnerText).start()
    const extractionStartTime = Date.now()

    try {
      if (format !== 'groq-type-nodes') {
        throw new Error(`Unsupported format: "${format}"`)
      }

      const result = await studioWorkerTask<ExtractSchemaWorkerMessage>(
        new URL('extractSanitySchema.worker.js', import.meta.url),
        {
          name: 'extractSanitySchema',
          studioRootPath: workDir,
          workerData: {
            configPath: projectRoot.path,
            enforceRequiredFields,
            workDir,
            workspaceName,
          } satisfies ExtractSchemaWorkerData,
        },
      )

      if (result.type === 'error') {
        throw new SchemaExtractionError(result.error, result.validation)
      }

      const schema = result.schema

      // Ensure output directory exists
      await mkdir(outputDir, {recursive: true})

      // Write schema to file
      await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`)

      spin.succeed(successText)

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
  await runExtraction('Extracting schema...', `Extracted schema to ${outputPath}`)

  const absoluteWatchPatterns = await glob(watchPatterns, {
    absolute: true,
    ignore: IGNORED_PATTERNS,
  })

  // Create extraction runner with concurrency control
  const {runExtraction: runConcurrentExtraction} = createExtractionRunner(async () => {
    await runExtraction('Extracting schema...', `Extracted schema to ${outputPath}`)
  })

  // Debounced extraction trigger (1 second delay)
  const debouncedExtract = debounce(() => {
    void runConcurrentExtraction()
  }, 1000)

  const watcher: FSWatcher = chokidarWatch(absoluteWatchPatterns, {
    cwd: workDir,
    ignoreInitial: true,
  })

  watcher.on('all', (event, filePath) => {
    const timestamp = new Date().toLocaleTimeString()
    const relativePath = isAbsolute(filePath) ? relative(workDir, filePath) : filePath
    output.log(`[${timestamp}] ${event}: ${relativePath}`)
    debouncedExtract()
  })

  watcher.on('error', (err) => {
    output.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`)
  })

  const stop = async () => {
    await watcher.close()
  }

  return {stop, watcher}
}
