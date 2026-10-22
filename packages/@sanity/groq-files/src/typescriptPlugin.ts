import {type FSWatcher, watch} from 'node:fs'
import {dirname, join, resolve} from 'node:path'

import {generateGroqDeclarations} from './declarations.js'

export interface GroqTypeScriptPluginLogger {
  error(message: string): void
}

export interface GroqDirectoryWatcher {
  close(): void
}

/**
 * Watches each directory in `directories` (not recursively) and reports the
 * full path of every changed entry. Injected by tests; defaults to `fs.watch`.
 */
export type WatchGroqDirectories = (
  directories: readonly string[],
  onChange: (path: string) => void,
  onError: (error: Error) => void,
) => GroqDirectoryWatcher

/** One schema for the `.groq` files under one or more directories. Paths are relative to the project. */
export interface GroqTypeScriptPluginResource {
  path: string | string[]
  schema: string
}

export interface StartGroqTypeScriptPluginOptions {
  directory: string

  /** Milliseconds to wait after the last change before regenerating. Defaults to 50. */
  debounceMs?: number
  generate?: typeof generateGroqDeclarations
  logger?: GroqTypeScriptPluginLogger
  /**
   * One schema per folder, the same shape as the content mapper's `resources`. When set, only
   * `.groq` files under a resource `path` get declarations, and `schemaPath` is not used.
   */
  resources?: readonly GroqTypeScriptPluginResource[]
  schemaPath?: string
  watch?: WatchGroqDirectories
}

/** A directory the generator runs over, with the schema it uses. */
interface GenerationTarget {
  directory: string
  schemaPath: string
}

/**
 * Regenerates `*.d.groq.ts` when a `.groq` file or a schema is saved.
 * TypeScript 5 and 6 cannot add virtual files, so this is their editor path;
 * updates follow the file watcher, not each keystroke.
 *
 * Only the directories that hold `.groq` files, each target directory, and the
 * schemas' directories are watched. A `.groq` file created in a directory that
 * had none is picked up on the next schema save or editor restart.
 */
export function startGroqTypeScriptPlugin(
  options: StartGroqTypeScriptPluginOptions,
): GroqDirectoryWatcher {
  const directory = resolve(options.directory)
  const generate = options.generate ?? generateGroqDeclarations
  const watchDirectories = options.watch ?? watchWithFs
  const debounceMs = options.debounceMs ?? 50
  const targets = generationTargets(directory, options)
  const schemaPaths = new Set(targets.map((target) => target.schemaPath))

  let closed = false
  let timer: NodeJS.Timeout | undefined
  let running = false
  let pending = false
  let watcher: GroqDirectoryWatcher | undefined
  let watched = ''

  const report = (error: unknown, fallback: string) => {
    options.logger?.error(error instanceof Error ? error.message : fallback)
  }

  const onChange = (path: string) => {
    if (closed || !shouldRegenerate(path, schemaPaths)) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, debounceMs)
  }

  const rewatch = (directories: readonly string[]) => {
    const key = directories.join('\0')
    if (closed || key === watched) return
    watcher?.close()
    watched = key
    try {
      watcher = watchDirectories(directories, onChange, (error) =>
        report(error, 'Could not watch .groq files.'),
      )
    } catch (error) {
      watcher = undefined
      report(error, 'Could not watch .groq files.')
    }
  }

  function run(): void {
    if (closed) return
    if (running) {
      pending = true
      return
    }
    running = true
    void Promise.allSettled(targets.map((target) => generate(target)))
      .then((outcomes) => {
        const written: string[] = []
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled') written.push(...outcome.value)
          else report(outcome.reason, 'Failed to generate .groq declarations.')
        }
        rewatch(directoriesToWatch(targets, written))
      })
      .finally(() => {
        running = false
        if (pending) {
          pending = false
          run()
        }
      })
  }

  run()

  return {
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      watcher?.close()
      watcher = undefined
    },
  }
}

/** Only a `.groq` file or one of the configured schema files triggers a run. */
export function shouldRegenerate(path: string, schemaPaths: ReadonlySet<string>): boolean {
  if (schemaPaths.has(path)) return true
  return path.endsWith('.groq')
}

function generationTargets(
  directory: string,
  options: StartGroqTypeScriptPluginOptions,
): GenerationTarget[] {
  if (!options.resources) {
    return [{directory, schemaPath: resolve(directory, options.schemaPath ?? 'schema.json')}]
  }
  const targets: GenerationTarget[] = []
  for (const resource of options.resources) {
    const schemaPath = resolve(directory, resource.schema)
    for (const path of Array.isArray(resource.path) ? resource.path : [resource.path]) {
      targets.push({directory: resolve(directory, path), schemaPath})
    }
  }
  return targets
}

function directoriesToWatch(
  targets: readonly GenerationTarget[],
  written: readonly string[],
): string[] {
  const directories = new Set<string>()
  for (const target of targets) directories.add(target.directory).add(dirname(target.schemaPath))
  for (const file of written) directories.add(dirname(file))
  return [...directories].toSorted((left, right) => left.localeCompare(right))
}

const watchWithFs: WatchGroqDirectories = (directories, onChange, onError) => {
  const watchers: FSWatcher[] = []
  for (const dir of directories) {
    let fsWatcher: FSWatcher
    try {
      fsWatcher = watch(dir, {persistent: false}, (_event, filename) => {
        if (filename !== null) onChange(join(dir, String(filename)))
      })
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      continue
    }
    fsWatcher.on('error', onError)
    watchers.push(fsWatcher)
  }
  return {
    close() {
      for (const fsWatcher of watchers) fsWatcher.close()
    },
  }
}
