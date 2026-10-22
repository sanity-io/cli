import {relative, resolve} from 'node:path'

import {
  generateGroqDeclarations,
  type GenerateGroqDeclarationsOptions,
  type GroqDeclaration,
  type TypeGenConfig,
} from '@sanity/codegen'
import picomatch from 'picomatch'
import {glob} from 'tinyglobby'

import {toForwardSlashes} from '../../util/toForwardSlashes.js'
import {count} from './count.js'
import {type ResolvedResource} from './generateResourceTypes.js'

/**
 * Options for codegen's `generateGroqDeclarations` that type every `.groq` file in the query
 * folders against the one `schema`, for a run without resources.
 *
 * `.groq` files are looked for in the folders the query files are read from, so no further
 * configuration is needed: the static base of each `path` pattern, which is `src`, `app` and
 * `sanity` for the default patterns.
 */
export function groqDeclarationOptions(
  config: TypeGenConfig,
  workDir: string,
): GenerateGroqDeclarationsOptions & {path: string[]} {
  return {
    path: queryFolders(config.path, workDir).map((folder) => groqPattern(folder)),
    root: workDir,
    schema: config.schema,
  }
}

/**
 * How the `.groq` files of a run with resources are typed.
 */
export interface ResourceGroqDeclarationsPlan {
  /** `.groq` files that exist but are left untyped, and why. */
  warnings: string[]

  /** Options for codegen's `generateGroqDeclarations`. Absent when no resource types `.groq` files. */
  options?: GenerateGroqDeclarationsOptions
}

/**
 * Decides how the `.groq` files of a run with resources are typed. Each resource types the files
 * in its own query folders, as {@link groqDeclarationOptions} finds them, against its schema file.
 * A file in the folders of more than one resource belongs to the one codegen prefers: the
 * resource with the longest folder, and the one listed first when they are equally long.
 *
 * A resource without `schema` uses the schema bound to its dataset, which is fetched in memory,
 * and codegen types `.groq` files against schema files only. So such a resource is left out, the
 * files it would type are left out as well rather than typed against another resource's schema,
 * and a warning names them.
 */
export async function planResourceGroqDeclarations(options: {
  config: TypeGenConfig
  resolved: ResolvedResource[]
  workDir: string
}): Promise<ResourceGroqDeclarationsPlan> {
  const {config, resolved, workDir} = options
  const claimants = resolved.map((entry, index): Claimant => ({
    folders: queryFolders(entry.resource.path ?? config.path, workDir),
    index,
    key: entry.key,
    schemaPath: 'schemaPath' in entry ? entry.schemaPath : undefined,
  }))
  const locals = claimants.filter(
    (claimant): claimant is Claimant & {schemaPath: string} => claimant.schemaPath !== undefined,
  )
  const excluded = new Set<string>()
  const warnedFiles = new Set<string>()
  const warnings: string[] = []

  for (const fetched of claimants) {
    if (fetched.schemaPath !== undefined) continue
    const beaten = locals.filter((local) => prefers(fetched, local))
    const winners = locals.filter((local) => prefers(local, fetched))

    for (const folder of fetched.folders) {
      // Codegen would type these against the beaten resource's schema.
      for (const other of beaten.flatMap((local) => local.folders)) {
        if (contains(other, folder)) excluded.add(folder)
        else if (contains(folder, other)) excluded.add(other)
      }

      const winningFolders = winners.flatMap((local) => local.folders)
      if (winningFolders.some((other) => contains(other, folder))) continue
      const untyped = await glob(groqPattern(folder), {
        cwd: workDir,
        ignore: [
          '**/node_modules/**',
          ...winningFolders
            .filter((other) => contains(folder, other))
            .map((other) => everythingUnder(other)),
        ],
        onlyFiles: true,
      })
      const files = untyped.filter((file) => !warnedFiles.has(file))
      for (const file of files) warnedFiles.add(file)
      if (files.length === 0) continue
      const where = folder === '.' ? 'in the project' : `under "${folder}"`
      warnings.push(
        `No declarations for the ${count(files.length, '.groq files', '.groq file')} ${where}: "${fetched.key}" uses the schema bound to its dataset, and .groq files are typed against a schema file only. Set "schema" for this resource to type them.`,
      )
    }
  }

  if (locals.length === 0) return {warnings}
  const folders = [...new Set(locals.flatMap((local) => local.folders))]
  return {
    options: {
      path: [
        ...folders.map((folder) => groqPattern(folder)),
        ...[...excluded].map((folder) => `!${everythingUnder(folder)}`),
      ],
      resources: locals.map(({folders: path, schemaPath}) => ({path, schema: schemaPath})),
      root: workDir,
    },
    warnings,
  }
}

/** A resource as codegen's `GroqFileResource` sees it, with what decides which file it types. */
interface Claimant {
  folders: string[]
  /** Its position among the resources, which breaks ties. */
  index: number
  key: string

  /** Absent for a resource whose schema is fetched. */
  schemaPath?: string
}

/**
 * Whether codegen types a file both resources claim against `claimant` rather than `other`: the
 * one with the longest folder wins, and the one listed first when they are equally long.
 */
function prefers(claimant: Claimant, other: Claimant): boolean {
  const difference = specificity(claimant) - specificity(other)
  return difference > 0 || (difference === 0 && claimant.index < other.index)
}

function specificity(claimant: Claimant): number {
  return Math.max(-1, ...claimant.folders.map((folder) => folder.length))
}

/** Whether `folder` contains `other`, itself included. `.` contains every folder. */
function contains(folder: string, other: string): boolean {
  return folder === '.' || other === folder || other.startsWith(`${folder}/`)
}

/**
 * Generates `.groq` declarations one run at a time, for a watcher that cannot wait for the run.
 * A run requested while one is going starts another once it ends, so a change during a run is not
 * lost. Each run reports its result or its error, and never throws.
 */
export function createGroqDeclarationsRunner(options: {
  onError: (error: unknown) => void
  onGenerated: (declarations: GroqDeclaration[]) => void
  options: GenerateGroqDeclarationsOptions
}): () => Promise<void> {
  const {onError, onGenerated} = options
  let activeRun: Promise<void> | undefined
  let isPending = false

  async function generate(): Promise<void> {
    try {
      onGenerated(await generateGroqDeclarations(options.options))
    } catch (error) {
      onError(error)
    }
  }

  return async function run(): Promise<void> {
    if (activeRun) {
      isPending = true
      return
    }

    isPending = false
    activeRun = generate()
    try {
      await activeRun
    } finally {
      activeRun = undefined
    }

    if (isPending) await run()
  }
}

/**
 * The folders a query `path` reads from, relative to `workDir` with forward slashes, in order
 * and without repeats: the static base of each pattern, as `watchResourceTypes` watches them. `.`
 * is `workDir`. A pattern starting with `!` narrows the query files, not the folders.
 */
export function queryFolders(path: string | string[], workDir: string): string[] {
  const folders = new Set<string>()
  for (const pattern of Array.isArray(path) ? path : [path]) {
    if (!pattern || pattern.startsWith('!')) continue
    const normalized = toForwardSlashes(relative(workDir, resolve(workDir, pattern)))
    folders.add(picomatch.scan(normalized).base || '.')
  }
  return [...folders]
}

/** Every `.groq` file under a folder, as a glob relative to the work directory. */
function groqPattern(folder: string): string {
  return folder === '.' ? '**/*.groq' : `${folder}/**/*.groq`
}

/** Everything under a folder, as a glob relative to the work directory. */
function everythingUnder(folder: string): string {
  return folder === '.' ? '**' : `${folder}/**`
}
