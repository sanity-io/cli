import {dirname} from 'node:path'

import {z} from 'zod'

import {studioWorkerTask} from '../../loaders/studio/studioWorkerTask.js'

const schemaSchema = z.object({
  name: z.string().optional(),
  types: z.array(z.object({}).passthrough()),
})

const sourceSchema = z.object({
  dataset: z.string(),
  projectId: z.string(),
  schema: schemaSchema,
})

const singleStudioWorkspaceSchema = z
  .object({
    ...sourceSchema.shape,
    basePath: z.string().optional(),
    name: z.string().optional(),
    plugins: z.array(z.unknown()).optional(),
    title: z.string().optional(),
    unstable_sources: z.array(sourceSchema),
  })
  .passthrough()

const studioWorkspaceSchema = z.object({
  ...sourceSchema.shape,
  basePath: z.string(),
  name: z.string(),
  plugins: z.array(z.unknown()).optional(),
  title: z.string(),
  unstable_sources: z.array(sourceSchema),
})

const rawConfigSchema = z.union([z.array(studioWorkspaceSchema), singleStudioWorkspaceSchema])
const resolvedConfigSchema = z.array(studioWorkspaceSchema)

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

  return options.resolvePlugins ? resolvedConfigSchema.parse(result) : rawConfigSchema.parse(result)
}
