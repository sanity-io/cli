import path, {isAbsolute} from 'node:path'

import {type CLITelemetryStore} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {debounce, mean, once} from 'lodash-es'
import picomatch from 'picomatch'
import {type Plugin} from 'vite'

import {formatSchemaValidation} from '../../actions/schema/formatSchemaValidation.js'
import {runSchemaExtraction} from '../../actions/schema/runSchemaExtraction.js'
import {SchemaExtractionError} from '../../actions/schema/utils/SchemaExtractionError.js'
import {
  SchemaExtractedTrace,
  SchemaExtractionWatchModeTrace,
} from '../../telemetry/extractSchema.telemetry.js'

/**
 * Default glob patterns to watch for schema changes.
 * Covers the sanity config file and common schema directory naming conventions.
 */
const DEFAULT_SCHEMA_PATTERNS = [
  'sanity.config.{js,jsx,ts,tsx,mjs}',
  'schema*/**/*.{js,jsx,ts,tsx,mjs}',
]

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_MS = 1000

/**
 * Delay before initial extraction to allow Vite to finish startup
 * and avoid race conditions with module resolution.
 */
const INITIAL_EXTRACTION_DELAY_MS = 1000

/**
 * Options for the Sanity schema extraction Vite plugin.
 *
 * @public
 */
export interface SchemaExtractionPluginOptions {
  /**
   * Additional glob patterns to watch for schema changes.
   * These are merged with the default patterns.
   * @example `['lib/custom-types/**\/*.ts', 'shared/schemas/**\/*.ts']`
   */
  additionalPatterns?: string[]

  /**
   * Debounce delay in milliseconds before triggering extraction
   * after a file change. Helps prevent excessive extractions
   * during rapid file saves.
   * @defaultValue 1000
   */
  debounceMs?: number

  /**
   * When true, marks all fields as required in the extracted schema
   * unless they are explicitly marked as optional.
   * @defaultValue false
   */
  enforceRequiredFields?: boolean

  /**
   * Format of schema export. groq-type-nodes is the only avilable format at the moment
   */
  format?: string

  /**
   * Logger for output messages. Must implement `log`, `info`, and `error` methods.
   * @defaultValue `console`
   */
  output?: Pick<Console, 'error' | 'info' | 'log'>

  /**
   * Path where the extracted schema JSON will be written.
   * Can be absolute or relative to the working directory.
   * @defaultValue `path.join(workDir, 'schema.json')`
   */
  outputPath?: string

  /**
   * Telemetry logger for the Sanity CLI tooling. If no logger is provided no telemetry
   * is sent. Also, no telemetry will be sent if telemetry is disabled in the sanity CLI.
   */
  telemetryLogger?: CLITelemetryStore

  /**
   * Working directory containing the Sanity configuration.
   * This should be the root of your Sanity Studio project where
   * `sanity.config.ts` is located.
   * @defaultValue Vite's project root (`config.root`)
   */
  workDir?: string

  /**
   * Workspace name for multi-workspace Sanity configurations.
   * Required when your `sanity.config.ts` exports multiple workspaces
   * and you want to extract schema from a specific one.
   */
  workspaceName?: string
}

/**
 * Creates a Vite plugin that automatically extracts Sanity schema during development and build.
 *
 * **During development:**
 * The plugin performs an initial extraction when the dev server starts, then watches
 * for file changes and re-extracts the schema when relevant files are modified.
 *
 * **During build:**
 * The plugin extracts the schema once at the end of the build process, ensuring
 * the schema is always up-to-date when deploying.
 *
 * **How it works in dev mode:**
 * 1. Registers watch patterns with Vite's built-in file watcher
 * 2. Performs initial schema extraction when the server starts
 * 3. On file changes matching the patterns, triggers a debounced extraction
 * 4. Uses concurrency control to prevent overlapping extractions
 *
 * @param options - Configuration options for the plugin
 * @returns A Vite plugin configured for schema extraction
 *
 * @internal
 */
export function sanitySchemaExtractionPlugin(options: SchemaExtractionPluginOptions = {}) {
  const {
    additionalPatterns = [],
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enforceRequiredFields = false,
    format = 'groq-type-nodes',
    output = console,
    outputPath: outputPathOption = 'schema.json',
    telemetryLogger,
    workDir: workDirOption,
    workspaceName,
  } = options

  const watchPatterns = [...DEFAULT_SCHEMA_PATTERNS, ...additionalPatterns]

  // Resolved after Vite config is available
  let resolvedWorkDir: string
  let resolvedOutputPath: string

  // State for concurrency control
  let isExtracting = false
  let pendingExtraction = false

  // Stats for telemetry
  const startTime = Date.now()
  const stats: {failedCount: number; successfulDurations: number[]} = {
    failedCount: 0,
    successfulDurations: [],
  }

  const extractSchema = () =>
    runSchemaExtraction({
      configPath: path.join(resolvedWorkDir, 'sanity.config.ts'),
      enforceRequiredFields,
      format,
      outputPath: resolvedOutputPath,
      watchPatterns: additionalPatterns,
      workspace: workspaceName,
    })

  /**
   * Runs extraction with concurrency control.
   * If extraction is already running, queues one more extraction to run after completion.
   */
  async function runExtraction(isBuilding = false): Promise<void> {
    if (isExtracting) {
      pendingExtraction = true
      return
    }

    isExtracting = true
    pendingExtraction = false

    const extractionStartTime = Date.now()
    try {
      await extractSchema()
      if (isBuilding) {
        // TODO: Remove when we have better control over progress reporting in build
        output.log('')
      }
      output.log(logSymbols.success, `Extracted schema to ${outputPathOption}`)

      // add stats for the successful extraction run to use later for telemetry
      stats.successfulDurations.push(Date.now() - extractionStartTime)
    } catch (err) {
      output.log(
        logSymbols.error,
        `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      if (err instanceof SchemaExtractionError && err.validation && err.validation.length > 0) {
        output.log(logSymbols.error, formatSchemaValidation(err.validation))
      }

      // track the failed extraction
      stats.failedCount++
    } finally {
      isExtracting = false

      // If a change came in during extraction, run again
      if (pendingExtraction) {
        pendingExtraction = false
        await runExtraction()
      }
    }
  }

  const debouncedExtract = debounce(() => {
    void runExtraction()
  }, debounceMs)

  // Create a matcher function from all watch patterns
  const isMatch = picomatch(watchPatterns)

  // Handler for file changes
  const handleChange = (filePath: string) => {
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(resolvedWorkDir, filePath)
      : filePath
    if (isMatch(relativePath)) {
      debouncedExtract()
    }
  }

  return {
    name: 'sanity/schema-extraction',

    configResolved(config) {
      // Resolve workDir from option or Vite's project root
      resolvedWorkDir = workDirOption ?? config.root

      resolvedOutputPath = isAbsolute(outputPathOption)
        ? outputPathOption
        : path.join(resolvedWorkDir, outputPathOption)
    },

    configureServer(server) {
      const trace = telemetryLogger?.trace(SchemaExtractionWatchModeTrace)
      trace?.start()

      trace?.log({enforceRequiredFields, schemaFormat: format, step: 'started'})

      // Add schema patterns to Vite's watcher
      const absolutePatterns = watchPatterns.map((pattern) => path.join(resolvedWorkDir, pattern))
      server.watcher.add(absolutePatterns)

      // Prepare function to log "stopped" event to trace and complete the trace
      const onClose = once(() => {
        // Cancel any pending debounced extractions
        debouncedExtract.cancel()

        // Log telemetry if available
        if (trace) {
          trace.log({
            averageExtractionDuration: mean(stats.successfulDurations),
            extractionFailedCount: stats.failedCount,
            extractionSuccessfulCount: stats.successfulDurations.length,
            step: 'stopped',
            watcherDuration: Date.now() - startTime,
          })
          trace.complete()
        }

        // Clean up process listeners (must always run, not just when trace exists)
        process.off('SIGTERM', onClose)
        process.off('SIGINT', onClose)
      })

      server.watcher.on('change', handleChange)
      server.watcher.on('add', handleChange)
      server.watcher.on('unlink', handleChange)

      // call the watcherClosed method when watcher is closed or when process is stopped/killed
      server.watcher.on('close', onClose)
      process.on('SIGTERM', onClose)
      process.on('SIGINT', onClose)

      // Run initial extraction after server is ready
      const startExtraction = () => {
        setTimeout(() => {
          // Notify about schema extraction enabled
          output.info(logSymbols.info, 'Schema extraction enabled. Watching:')
          for (const pattern of watchPatterns) {
            output.info(`  - ${pattern}`)
          }

          // Perform first extraction
          void runExtraction()
        }, INITIAL_EXTRACTION_DELAY_MS)
      }

      if (server.httpServer) {
        server.httpServer.once('listening', startExtraction)
      } else {
        // Middleware mode - no HTTP server, run extraction immediately
        startExtraction()
      }
    },

    async buildEnd() {
      const trace = telemetryLogger?.trace(SchemaExtractedTrace)
      trace?.start()

      try {
        const start = Date.now()
        const schema = await extractSchema()
        output.error(`✓ Extract schema (${Date.now() - start}ms)`)

        trace?.log({
          enforceRequiredFields,
          schemaAllTypesCount: schema.length,
          schemaDocumentTypesCount: schema.filter((type) => type.type === 'document').length,
          schemaFormat: format,
          schemaTypesCount: schema.filter((type) => type.type === 'type').length,
        })
      } catch (err) {
        trace?.error(err)
        throw err
      } finally {
        trace?.complete()
      }
    },
  } satisfies Plugin
}
