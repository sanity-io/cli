import {basename, dirname, isAbsolute, relative, resolve} from 'node:path'

import {
  createSchemaPatternMatcher,
  type ExtractOptions,
  formatSchemaValidation,
  runSchemaExtraction,
  SchemaExtractionError,
} from '@sanity/cli-build/_internal/extract'
import {exitCodes, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {watch as chokidarWatch, type FSWatcher} from 'chokidar'
import debounce from 'lodash-es/debounce.js'
import picomatch from 'picomatch'

import {schemasExtractDebug} from './utils/debug.js'

/** Default glob patterns to watch for schema changes */
export const DEFAULT_WATCH_PATTERNS = [
  'sanity.config.{js,jsx,ts,tsx,mjs}',
  'schema*/**/*.{js,jsx,ts,tsx,mjs}',
]

/**
 * Directory names never descended into, unless a watch pattern names one directly. chokidar 4 and
 * later reject glob `ignored` patterns, so this matches on the directory name alone.
 */
const IGNORED_DIRECTORIES = new Set([
  '.astro',
  '.cache',
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.sanity',
  '.svelte-kit',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'lib',
  'node_modules',
  'out',
])

/**
 * Returns `pattern` relative to `workDir` with forward slashes, so one string can feed both the
 * base scan and the matcher. A pattern with no glob characters names a file or a directory, and a
 * directory matches everything inside it.
 */
function normalizeWatchPattern(pattern: string, workDir: string): string[] {
  const normalized = relative(workDir, resolve(workDir, pattern)).replaceAll('\\', '/')
  if (!normalized) return ['**']
  return picomatch.scan(normalized).isGlob ? [normalized] : [normalized, `${normalized}/**`]
}

/**
 * Returns the directories to hand chokidar for `patterns`, deduplicated.
 *
 * chokidar 4 and later do not expand globs, so a pattern cannot be watched directly: it has to
 * be reduced to its static base directory, with `isMatch` filtering the events that base emits.
 * Both default patterns begin with a glob segment, so both reduce to `workDir` itself.
 */
function watchRootsFor(patterns: string[], workDir: string): string[] {
  const bases = patterns.map((pattern) => resolve(workDir, picomatch.scan(pattern).base))
  return [...new Set(bases)]
}

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
        output.error(err.message, {exit: exitCodes.RUNTIME_ERROR})
      }

      return false
    }
  }

  // Run initial extraction
  await runExtraction()

  // Create extraction runner with concurrency control
  const {runExtraction: runConcurrentExtraction} = createExtractionRunner(async () => {
    await runExtraction()
  })

  // Debounced extraction trigger (1 second delay)
  const debouncedExtract = debounce(() => {
    void runConcurrentExtraction()
  }, 1000)

  const normalizedPatterns = watchPatterns.flatMap((pattern) =>
    normalizeWatchPattern(pattern, workDir),
  )
  const {isMatch} = createSchemaPatternMatcher(normalizedPatterns)

  const watchRoots = watchRootsFor(normalizedPatterns, workDir)
  // A pattern can name a directory this would otherwise skip, such as the documented
  // `--watch-patterns "lib/**/*.ts"`. chokidar asks about each root before descending, so
  // skipping one there would leave it unwatched and silently match nothing.
  const watchRootSet = new Set(watchRoots)
  // Every extraction rewrites this file. Watching it would make each run trigger the next.
  const outputFile = resolve(workDir, outputPath).toLowerCase()
  const isOutputFile = (path: string) => resolve(workDir, path).toLowerCase() === outputFile

  const watcher: FSWatcher = chokidarWatch(watchRoots, {
    cwd: workDir,
    ignored: (path) =>
      isOutputFile(path) ||
      (!watchRootSet.has(resolve(workDir, path)) && IGNORED_DIRECTORIES.has(basename(path))),
    ignoreInitial: true,
  })

  watcher.on('all', (event, filePath) => {
    if (isOutputFile(filePath) || !isMatch(filePath, workDir)) {
      return
    }

    const timestamp = new Date().toLocaleTimeString()
    const relativePath = isAbsolute(filePath) ? relative(workDir, filePath) : filePath
    output.log(`[${timestamp}] ${event}: ${relativePath}`)
    debouncedExtract()
  })

  watcher.on('error', (err) => {
    // `output.error` throws unless told not to exit. A watch session should survive a transient
    // fs error such as EMFILE or an inotify limit, the way the typegen watcher does.
    output.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`, {
      exit: false,
    })
  })

  return {
    close: () => watcher.close(),
    watcher,
  }
}
