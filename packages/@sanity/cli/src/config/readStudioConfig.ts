import {resolve} from 'node:path'

import {z} from 'zod'

import {studioWorkerTask} from '../loaders/studio/studioWorkerTask.js'

const schemaSchema = z.object({
  name: z.string().optional(),
  types: z.array(z.object({}).passthrough()),
})

const singleStudioWorkspaceSchema = z
  .object({
    basePath: z.string().optional(),
    dataset: z.string(),
    name: z.string().optional(),
    plugins: z.array(z.unknown()).optional(),
    projectId: z.string(),
    schema: schemaSchema.optional(),
    title: z.string().optional(),
  })
  .passthrough()

const studioWorkspaceSchema = z.object({
  basePath: z.string(),
  dataset: z.string(),
  name: z.string(),
  plugins: z.array(z.unknown()).optional(),
  projectId: z.string(),
  schema: z.object({_original: schemaSchema}),
  title: z.string(),
})

const rawConfigSchema = z.union([z.array(studioWorkspaceSchema), singleStudioWorkspaceSchema])
const resolvedConfigSchema = z.array(studioWorkspaceSchema)

export type SingleStudioWorkspace = z.infer<typeof singleStudioWorkspaceSchema>
export type StudioWorkspace = z.infer<typeof studioWorkspaceSchema>
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
  const result = await studioWorkerTask(
    resolve(import.meta.dirname, 'readStudioConfig.worker.js'),
    {
      name: 'studioConfig',
      workerData: {configPath, resolvePlugins: options.resolvePlugins},
    },
  )

  return options.resolvePlugins ? resolvedConfigSchema.parse(result) : rawConfigSchema.parse(result)
}
