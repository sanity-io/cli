import {
  type createDefaultIcon,
  type createSchema,
  type generateStudioManifest,
  type resolveConfig,
  type SchemaError,
  type SchemaValidationProblemGroup,
  type StudioManifest,
  type Workspace,
} from 'sanity'

import {subdebug} from '../_exports/debug.js'
import {resolveLocalPackage} from './resolveLocalPackage.js'

const debug = subdebug('loadStudioCliTooling')

/**
 * The operations the CLI needs from the studio to resolve workspaces, compile schemas and
 * generate manifests.
 *
 * Studios provide these through `getStudioCliTooling()` from `sanity/cli`, so the CLI does not
 * depend on where the underlying functions are exported from inside `sanity`. Studios that do
 * not provide it yet are served by {@link loadStudioCliTooling}'s fallback to the root `sanity`
 * exports.
 *
 * @internal
 */
export interface StudioCliTooling {
  /** Compiles a schema definition. Replaces `createSchema()`. */
  compileSchema: (definition: Parameters<typeof createSchema>[0]) => ReturnType<typeof createSchema>

  /** Creates the icon used for a workspace or tool that does not define one. */
  createDefaultIcon: (title: string, subtitle: string) => ReturnType<typeof createDefaultIcon>

  /** Generates the studio manifest for resolved workspaces. */
  generateStudioManifest: (
    options: Parameters<typeof generateStudioManifest>[0],
  ) => Promise<StudioManifest>

  /**
   * Returns the validation problem groups carried by a schema error thrown while resolving or
   * compiling a schema, or `undefined` if `error` is not a schema error.
   */
  getSchemaValidation: (error: unknown) => SchemaValidationProblemGroup[] | undefined

  /** Resolves workspace configs into workspaces. Replaces `resolveConfig()`. */
  resolveWorkspaces: (workspaces: Parameters<typeof resolveConfig>[0]) => Promise<Workspace[]>
}

interface LegacySanityExports {
  createDefaultIcon?: StudioCliTooling['createDefaultIcon']
  createSchema?: StudioCliTooling['compileSchema']
  generateStudioManifest?: StudioCliTooling['generateStudioManifest']
  resolveConfig?: (
    workspaces: Parameters<typeof resolveConfig>[0],
  ) => ReturnType<typeof resolveConfig>
  SchemaError?: typeof SchemaError
}

interface SanityCliExports {
  getStudioCliTooling?: () => Promise<StudioCliTooling> | StudioCliTooling
}

/**
 * Loads the {@link StudioCliTooling} from the studio installed relative to `workDir`.
 *
 * Uses `getStudioCliTooling()` from `sanity/cli` when the studio provides it. Otherwise falls
 * back to the functions exported from the root `sanity` entry, which is where studios that
 * predate the entry export them.
 *
 * @param workDir - The working directory to resolve `sanity` from
 * @internal
 */
export async function loadStudioCliTooling(workDir: string): Promise<StudioCliTooling> {
  const getStudioCliTooling = await resolveGetStudioCliTooling(workDir)
  if (getStudioCliTooling) {
    debug('Using getStudioCliTooling() from sanity/cli')
    return getStudioCliTooling()
  }

  debug('sanity/cli has no getStudioCliTooling(), using exports from sanity')
  return createToolingFromRootExports(workDir)
}

async function resolveGetStudioCliTooling(
  workDir: string,
): Promise<SanityCliExports['getStudioCliTooling']> {
  try {
    const sanityCli = await resolveLocalPackage<SanityCliExports>('sanity/cli', workDir)
    return typeof sanityCli.getStudioCliTooling === 'function'
      ? sanityCli.getStudioCliTooling
      : undefined
  } catch (err) {
    debug('Failed to load sanity/cli: %o', err)
    return undefined
  }
}

async function createToolingFromRootExports(workDir: string): Promise<StudioCliTooling> {
  const sanity = await resolveLocalPackage<LegacySanityExports>('sanity', workDir)

  return {
    compileSchema: (definition) => requireExport(sanity.createSchema, 'createSchema')(definition),
    createDefaultIcon: (title, subtitle) =>
      requireExport(sanity.createDefaultIcon, 'createDefaultIcon')(title, subtitle),
    generateStudioManifest: (options) =>
      requireExport(sanity.generateStudioManifest, 'generateStudioManifest')(options),
    getSchemaValidation: (error) =>
      typeof sanity.SchemaError === 'function' && error instanceof sanity.SchemaError
        ? error.schema._validation
        : undefined,
    resolveWorkspaces: async (workspaces) => {
      const resolve = requireExport(sanity.resolveConfig, 'resolveConfig')
      // Imported lazily: rxjs is only needed here, but this module is reachable from the
      // `@sanity/cli-core` barrel that every command loads.
      // eslint-disable-next-line eslint-js/no-restricted-syntax -- package import, not a file path
      const {firstValueFrom} = await import('rxjs')
      return firstValueFrom(resolve(workspaces))
    },
  }
}

function requireExport<T>(value: T | undefined, name: string): T {
  if (typeof value !== 'function') {
    throw new TypeError(`Expected \`${name}\` from \`sanity\` to be a function`)
  }
  return value
}
