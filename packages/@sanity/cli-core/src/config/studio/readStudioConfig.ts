import {dirname} from 'node:path'

import {z} from 'zod'

import {studioWorkerTask} from '../../loaders/studio/studioWorkerTask.js'

const schemaSchema = z.looseObject({
  name: z.string().optional(),
  types: z.array(z.looseObject({})),
})

const sourceSchema = z.looseObject({
  dataset: z.string(),
  projectId: z.string(),
  schema: z.looseObject({_original: schemaSchema}),
})

// Raw workspace schema (resolvePlugins: false) - unstable_sources not yet populated
const rawWorkspaceSchema = z.looseObject({
  ...sourceSchema.shape,
  basePath: z.string().optional(),
  name: z.string().optional(),
  plugins: z.array(z.unknown()).optional(),
  schema: schemaSchema.optional(),
  title: z.string().optional(),
  unstable_sources: z.array(sourceSchema).optional(),
})

// Resolved config schema (resolvePlugins: true) - all fields required
const resolvedWorkspaceSchema = z.looseObject({
  ...sourceSchema.shape,
  basePath: z.string(),
  name: z.string(),
  plugins: z.array(z.unknown()).optional(),
  title: z.string(),
  unstable_sources: z.array(sourceSchema),
})

const rawConfigSchema = z.union([z.array(rawWorkspaceSchema), rawWorkspaceSchema])
const resolvedConfigSchema = z.array(resolvedWorkspaceSchema)

export type RawStudioConfig = z.infer<typeof rawConfigSchema>
export type ResolvedStudioConfig = z.infer<typeof resolvedConfigSchema>

export interface ReadStudioConfigOptions {
  /**
   * Whether or not to resolve the plugins defined in the config.
   *
   * In some cases, you need this in order to have the full picture of what the studio
   * would "see". As an example, plugins can define schema types that are not explicitly
   * defined in the users' schema types. In order to get the full picture, you need to
   * resolve the plugins, which is an asyncronous operation.
   *
   * In other cases, it might be enough to only do a shallow pass. As an example, if you
   * only need to know about the defined workspace, or the user-defined schema types,
   * this can be set to `false` - which should resolve faster (and potentially "safer")
   * in terms of not triggering all kinds of browser behavior that may or may not be
   * loaded as the plugins are resolved.
   */
  resolvePlugins: boolean
}

export async function readStudioConfig(
  configPath: string,
  options: {resolvePlugins: true},
): Promise<ResolvedStudioConfig>

export async function readStudioConfig(
  configPath: string,
  options: {resolvePlugins: false},
): Promise<RawStudioConfig>

export async function readStudioConfig(
  configPath: string,
  options: ReadStudioConfigOptions,
): Promise<RawStudioConfig | ResolvedStudioConfig> {
  const result = await studioWorkerTask(new URL('readStudioConfig.worker.js', import.meta.url), {
    name: 'studioConfig',
    studioRootPath: dirname(configPath),
    workerData: {configPath, resolvePlugins: options.resolvePlugins},
  })

  try {
    return options.resolvePlugins
      ? resolvedConfigSchema.parse(result)
      : rawConfigSchema.parse(result)
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid studio config at ${configPath}:\n${formatZodIssues(err.issues)}`, {
        cause: err,
      })
    }

    throw err
  }
}

/**
 * Recursively extracts leaf-level messages from Zod issues, including
 * those nested inside union errors. Note that `prettifyError` from Zod
 * only gives a high-level summary for union errors, so this function is
 * needed to get the full details of all validation issues in a readable format.
 *
 * @internal exported for testing only
 */
export function formatZodIssues(issues: z.core.$ZodIssue[], indent = 2): string {
  const lines: string[] = []
  const prefix = ' '.repeat(indent)

  for (const issue of issues) {
    if (issue.code === 'invalid_union' && 'errors' in issue && Array.isArray(issue.errors)) {
      for (const [i, unionIssues] of issue.errors.entries()) {
        lines.push(`${prefix}Union option ${i + 1}:`, formatZodIssues(unionIssues, indent + 2))
      }
    } else {
      const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : ''
      lines.push(`${prefix}- ${issue.message}${path}`)
    }
  }

  return lines.join('\n')
}
