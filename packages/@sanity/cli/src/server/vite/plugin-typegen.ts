import {existsSync} from 'node:fs'
import path from 'node:path'

import {CLITelemetryStore} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {
  type GenerationResult,
  runTypegenGenerate,
  type TypeGenConfig,
  TypegenWatchModeTrace,
  TypesGeneratedTrace,
} from '@sanity/codegen'
import {debounce, mean, once} from 'lodash-es'
import picomatch from 'picomatch'
import {type Plugin} from 'vite'

import {toForwardSlashes} from '../../util/toForwardSlashes.js'

/**
 * Default glob patterns to watch for query file changes.
 * Covers common source directory naming conventions.
 */
const DEFAULT_QUERY_PATTERNS = ['./src/**/*.{ts,tsx,js,jsx}', './app/**/*.{ts,tsx,js,jsx}']

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_MS = 1000

/**
 * Delay before initial generation to allow Vite to finish startup
 * and avoid race conditions with module resolution.
 */
const INITIAL_GENERATION_DELAY_MS = 1000

/**
 * Options for the Sanity typegen Vite plugin.
 *
 * @internal
 */
interface TypegenPluginOptions {
  /**
   * Typegen configuration from sanity.cli.ts.
   * All fields are optional and will use sensible defaults.
   */
  config: Partial<TypeGenConfig>

  /**
   * Working directory containing the Sanity configuration.
   * This should be the root of your Sanity Studio project.
   */
  workDir: string

  /**
   * Logger for output messages. Must implement `log`, `info`, and `error` methods.
   * @defaultValue `console`
   */
  output?: Pick<Console, 'error' | 'info' | 'log'>

  /**
   * Telemetry logger for the Sanity CLI tooling.
   */
  telemetryLogger?: CLITelemetryStore
}

/**
 * Creates a Vite plugin that automatically generates TypeScript types during development and build.
 *
 * **During development:**
 * The plugin performs an initial generation when the dev server starts, then watches
 * for file changes and re-generates types when relevant files are modified.
 *
 * **During build:**
 * The plugin generates types once at the end of the build process.
 *
 * **Prerequisites:**
 * The schema.json file must exist before typegen can run. Run `sanity schema extract`
 * first to generate the schema file.
 *
 * @param options - Configuration options for the plugin
 * @returns A Vite plugin configured for typegen
 *
 * @internal
 */
export function sanityTypegenPlugin(options: TypegenPluginOptions): Plugin {
  const {config: inputConfig, output = console, telemetryLogger, workDir} = options

  // Apply defaults to config
  const config: TypeGenConfig = {
    formatGeneratedCode: inputConfig.formatGeneratedCode ?? false,
    generates: inputConfig.generates ?? 'sanity.types.ts',
    overloadClientMethods: inputConfig.overloadClientMethods ?? false,
    path: inputConfig.path ?? DEFAULT_QUERY_PATTERNS,
    schema: inputConfig.schema ?? 'schema.json',
  }

  // Build query patterns from config
  const queryPatterns = Array.isArray(config.path) ? config.path : [config.path]

  // Resolved after Vite config is available
  let resolvedSchemaPath: string

  // State for concurrency control
  let isGenerating = false
  let pendingGeneration = false

  // Stats for telemetry
  const startTime = Date.now()
  const stats: {failedCount: number; successfulDurations: number[]} = {
    failedCount: 0,
    successfulDurations: [],
  }

  /**
   * Runs type generation with concurrency control.
   * If generation is already running, queues one more generation to run after completion.
   * Returns the generation result, or null if generation was skipped or failed.
   */
  async function runGeneration(isBuilding = false): Promise<GenerationResult | null> {
    if (isGenerating) {
      pendingGeneration = true
      return null
    }

    isGenerating = true
    pendingGeneration = false

    const generationStartTime = Date.now()

    try {
      // Validate schema.json exists
      if (!existsSync(resolvedSchemaPath)) {
        output.error(
          `${logSymbols.error} Schema file not found: ${config.schema}\n` +
            `Run "sanity schema extract" first to generate the schema file.`,
        )
        return null
      }

      const result = await runTypegenGenerate({
        config,
        workDir,
      })

      if (isBuilding) {
        // Add newline for better formatting in build output
        output.log('')
      }

      if (result.filesWithErrors > 0) {
        output.log(
          logSymbols.warning,
          `Generated types to ${config.generates} (with errors in ${result.filesWithErrors} file${result.filesWithErrors === 1 ? '' : 's'})`,
        )
      } else {
        output.log(logSymbols.success, `Generated types to ${config.generates}`)
      }

      // Track stats for telemetry (all completed generations count as successful)
      stats.successfulDurations.push(Date.now() - generationStartTime)

      return result
    } catch (err) {
      output.error(
        `${logSymbols.error} Generation failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      stats.failedCount++
      return null
    } finally {
      isGenerating = false

      // If a change came in during generation, run again
      if (pendingGeneration) {
        pendingGeneration = false
        void runGeneration()
      }
    }
  }

  const debouncedGenerate = debounce(() => {
    void runGeneration()
  }, DEFAULT_DEBOUNCE_MS)

  // Create a matcher function from query patterns
  const isQueryMatch = picomatch(queryPatterns)

  return {
    name: 'sanity/typegen',

    configResolved(viteConfig) {
      // Resolve paths from options or Vite's project root
      const rootDir = workDir ?? viteConfig.root

      resolvedSchemaPath = path.isAbsolute(config.schema)
        ? config.schema
        : path.join(rootDir, config.schema)
    },

    configureServer(server) {
      const trace = telemetryLogger?.trace(TypegenWatchModeTrace)
      trace?.start()
      trace?.log({step: 'started'})

      // Build absolute patterns for query files
      const absoluteQueryPatterns = queryPatterns.map((pattern) =>
        path.isAbsolute(pattern) ? pattern : path.join(workDir, pattern),
      )

      // Add query patterns AND schema.json to Vite's watcher
      server.watcher.add([...absoluteQueryPatterns, resolvedSchemaPath])

      // Listen for file changes
      const handleChange = (filePath: string) => {
        const relativePath = path.isAbsolute(filePath) ? path.relative(workDir, filePath) : filePath
        // Normalize to forward slashes for cross-platform picomatch compatibility
        const normalizedPath = toForwardSlashes(relativePath)

        // Trigger on schema.json change OR matching query file
        if (filePath === resolvedSchemaPath || isQueryMatch(normalizedPath)) {
          debouncedGenerate()
        }
      }

      // Prepare function to log "stopped" event to trace and complete the trace
      const onClose = once(() => {
        // Cancel any pending debounced extractions
        debouncedGenerate.cancel()

        if (trace) {
          trace.log({
            averageGenerationDuration: mean(stats.successfulDurations) || 0,
            generationFailedCount: stats.failedCount,
            generationSuccessfulCount: stats.successfulDurations.length,
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

      // Call the onClose method when watcher is closed or when process is stopped/killed
      server.watcher.on('close', onClose)
      process.on('SIGTERM', onClose)
      process.on('SIGINT', onClose)

      // Run initial generation after server is ready
      const startGeneration = () => {
        setTimeout(() => {
          // Notify about typegen enabled
          output.info(logSymbols.info, 'Typegen enabled. Watching:')
          for (const pattern of queryPatterns) {
            output.info(`  - ${pattern}`)
          }
          output.info(`  - ${config.schema} (schema)`)

          // Perform first generation
          void runGeneration()
        }, INITIAL_GENERATION_DELAY_MS)
      }

      if (server.httpServer) {
        server.httpServer.once('listening', startGeneration)
      } else {
        // Middleware mode - no HTTP server, run generation immediately
        startGeneration()
      }
    },

    async buildEnd() {
      // Build mode: One-time generation with telemetry tracking
      const result = await runGeneration(true)

      // Only log telemetry if generation completed successfully
      if (result && telemetryLogger) {
        const trace = telemetryLogger.trace(TypesGeneratedTrace)
        trace.start()
        trace.log({
          configMethod: 'cli',
          configOverloadClientMethods: config.overloadClientMethods ?? false,
          emptyUnionTypeNodesGenerated: result.emptyUnionTypeNodesGenerated,
          filesWithErrors: result.filesWithErrors,
          outputSize: result.code.length,
          queriesCount: result.queriesCount,
          queryFilesCount: result.queryFilesCount,
          schemaTypesCount: result.schemaTypesCount,
          typeNodesGenerated: result.typeNodesGenerated,
          unknownTypeNodesGenerated: result.unknownTypeNodesGenerated,
          unknownTypeNodesRatio:
            result.typeNodesGenerated > 0
              ? result.unknownTypeNodesGenerated / result.typeNodesGenerated
              : 0,
        })
        trace.complete()
      }
    },
  } satisfies Plugin
}
