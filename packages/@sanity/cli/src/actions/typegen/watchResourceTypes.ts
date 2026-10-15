import {existsSync} from 'node:fs'
import {basename, dirname, relative, resolve, sep} from 'node:path'

import {type TypeGenConfig, type TypegenProgressEvent} from '@sanity/codegen'
import {watch} from 'chokidar'
import debounce from 'lodash-es/debounce.js'
import mean from 'lodash-es/mean.js'
import picomatch from 'picomatch'

import {toForwardSlashes} from '../../util/toForwardSlashes.js'
import {generateResourceTypes, type ResolvedResource} from './generateResourceTypes.js'

/** Delay after the last change before generating again, as in watch mode without resources. */
const DEBOUNCE_MS = 1000

/** Directories that are never watched. Codegen's query scan skips `node_modules` as well. */
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])

/**
 * Delay after the last removal before watching removed paths again. Removing a directory tree
 * emits events from the inside out, and a watch set up on a parent that is removed a moment later
 * fails without an error.
 */
const REWATCH_DELAY_MS = 250

/**
 * A running watcher started by {@link watchResourceTypes}.
 */
export interface ResourceTypesWatcher {
  /** Statistics for the watch mode trace, counting each resource's generation. */
  getStats: () => {
    averageGenerationDuration: number
    generationFailedCount: number
    generationSuccessfulCount: number
    watcherDuration: number
  }
  /** Stops watching. Resolves once the resource generating at the time, if any, is written. */
  stop: () => Promise<void>
}

/**
 * Generates types for every resource, then generates them again whenever a query file or a local
 * schema file changes.
 *
 * The caller resolves the schemas, once. A schema fetched from a dataset's binding is used until
 * the watcher stops, so a schema deployed while it runs is not picked up until it restarts. A
 * local schema file is read again on every run, and a missing one fails only that resource's
 * generation until the file appears.
 *
 * Each resource generates on its own, so a broken schema or query in one does not hold back the
 * others. Generated files are not watched: outputs usually sit inside the query pattern, such as
 * `./src/sanity.types.production.ts` under `./src/**`, and writing one would start the next run.
 */
export function watchResourceTypes(options: {
  /** Settings shared by every resource. */
  config: TypeGenConfig
  /** Called for each change that schedules a run, with the path relative to `workDir`. */
  onChange?: (event: string, relativePath: string) => void
  /** Called when a resource's generation or the file watcher fails. The watcher keeps running. */
  onError?: (error: unknown) => void
  /** Returns the progress handler for one resource's generation. */
  onProgress?: (resolved: ResolvedResource) => ((event: TypegenProgressEvent) => void) | undefined
  resolved: ResolvedResource[]
  workDir: string
}): ResourceTypesWatcher {
  const {config, onChange, onError, onProgress, resolved, workDir} = options

  const queryMatchers = resolved.map(({resource}) =>
    createQueryMatcher(resource.path ?? config.path, workDir),
  )
  const schemaFiles = new Set(
    resolved.flatMap((entry) =>
      'schemaPath' in entry ? [resolve(workDir, entry.schemaPath)] : [],
    ),
  )
  // Lowercased, because two names that differ only in case are the same file on the default
  // macOS and Windows file systems.
  const outputFiles = new Set(
    resolved.map(({resource}) => resolve(workDir, resource.generates).toLowerCase()),
  )
  const roots = [...new Set([...queryMatchers.flatMap(({bases}) => bases), ...schemaFiles])]

  const startTime = Date.now()
  const successfulDurations: number[] = []
  let failedCount = 0
  let activeRun: Promise<void> | undefined
  let isPending = false
  let isStopped = false

  async function generateEach(): Promise<void> {
    for (const entry of resolved) {
      if (isStopped) return
      const generationStartTime = Date.now()
      try {
        await generateResourceTypes({config, onProgress, resolved: [entry], workDir})
        successfulDurations.push(Date.now() - generationStartTime)
      } catch (error) {
        failedCount++
        onError?.(error)
      }
    }
  }

  // Runs one generation at a time. Changes during a run queue a single follow-up run.
  async function runGeneration(): Promise<void> {
    if (isStopped) return
    if (activeRun) {
      isPending = true
      return
    }

    isPending = false
    activeRun = generateEach()
    try {
      await activeRun
    } finally {
      activeRun = undefined
    }

    if (isPending) await runGeneration()
  }

  const scheduleGeneration = debounce(() => void runGeneration(), DEBOUNCE_MS)

  const removedRoots = new Set<string>()
  const scheduleRewatch = debounce(() => {
    if (isStopped) return
    for (const root of removedRoots) {
      watcher.add(getWatchablePath(root))
    }
    removedRoots.clear()
  }, REWATCH_DELAY_MS)

  const watcher = watch(
    roots.map((root) => getWatchablePath(root)),
    {
      ignored: (path) =>
        IGNORED_DIRECTORIES.has(basename(path)) || outputFiles.has(resolve(path).toLowerCase()),
      ignoreInitial: true,
    },
  )

  watcher.on('all', (event, filePath) => {
    const absolutePath = resolve(workDir, filePath)

    // chokidar stops watching a path once it is removed, as when switching git branches, so watch
    // every root at or inside the removed path again to pick it up when it comes back.
    if (event === 'unlink' || event === 'unlinkDir') {
      for (const root of roots) {
        if (root === absolutePath || root.startsWith(absolutePath + sep)) {
          removedRoots.add(root)
          scheduleRewatch()
        }
      }
    }

    if (event !== 'add' && event !== 'change' && event !== 'unlink') return
    if (outputFiles.has(absolutePath.toLowerCase())) return

    const relativePath = toForwardSlashes(relative(workDir, absolutePath))
    if (
      !schemaFiles.has(absolutePath) &&
      !queryMatchers.some(({isMatch}) => isMatch(relativePath))
    ) {
      return
    }

    onChange?.(event, relativePath)
    scheduleGeneration()
  })

  watcher.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    onError?.(new Error(`Watcher error: ${message}`, {cause: error}))
  })

  void runGeneration()

  return {
    getStats: () => ({
      averageGenerationDuration: mean(successfulDurations) || 0,
      generationFailedCount: failedCount,
      generationSuccessfulCount: successfulDurations.length,
      watcherDuration: Date.now() - startTime,
    }),
    stop: async () => {
      isStopped = true
      scheduleGeneration.cancel()
      scheduleRewatch.cancel()
      await watcher.close()
      await activeRun
    },
  }
}

/**
 * Matches paths relative to `workDir` against one resource's query patterns, as codegen's query
 * scan reads them with globby:
 *
 * - A pattern starting with `!` excludes files from the patterns listed before it.
 * - A pattern without glob characters also matches everything inside it, in case it names a
 *   directory.
 *
 * chokidar 4 and later do not expand globs, so `bases` holds each pattern's static base directory
 * to watch.
 */
function createQueryMatcher(
  path: string | string[],
  workDir: string,
): {bases: string[]; isMatch: (relativePath: string) => boolean} {
  const includes: {excludes: string[]; patterns: string[]}[] = []
  for (const pattern of Array.isArray(path) ? path : [path]) {
    const isExclude = pattern.startsWith('!')
    // Relative to `workDir` with forward slashes, with `.` and `..` segments resolved, to compare
    // with event paths.
    const normalized = toForwardSlashes(
      relative(workDir, resolve(workDir, isExclude ? pattern.slice(1) : pattern)),
    )
    if (!normalized) continue
    if (isExclude) {
      for (const include of includes) include.excludes.push(normalized)
    } else {
      includes.push({
        excludes: [],
        patterns: picomatch.scan(normalized).isGlob
          ? [normalized]
          : [normalized, `${normalized}/**`],
      })
    }
  }

  const matchers = includes.map(({excludes, patterns}) =>
    picomatch(patterns, excludes.length > 0 ? {ignore: excludes} : {}),
  )
  return {
    bases: includes.map(({patterns}) => resolve(workDir, picomatch.scan(patterns[0]).base)),
    isMatch: (relativePath) => matchers.some((isMatch) => isMatch(relativePath)),
  }
}

/**
 * chokidar picks up a path created after it starts watching only while the path's parent exists.
 * For a deeper missing path, this returns its highest missing ancestor, whose parent exists.
 */
function getWatchablePath(path: string): string {
  let current = path
  while (dirname(current) !== current && !existsSync(dirname(current))) {
    current = dirname(current)
  }
  return current
}
