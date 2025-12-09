import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {z} from 'zod'

import {type CliConfig} from './types/cliConfig'
import {type UserViteConfig} from './types/userViteConfig'

export const cliConfigSchema = z.object({
  api: z
    .object({
      dataset: z.string().optional(),
      projectId: z.string().optional(),
    })
    .optional(),

  app: z
    .object({
      entry: z.string().optional(),
      id: z.string().optional(),
      organizationId: z.string().optional(),
    })
    .optional(),

  autoUpdates: z.boolean().optional(),

  deployment: z
    .object({
      appId: z.string().optional(),
      autoUpdates: z.boolean().optional(),
    })
    .optional(),

  graphql: z
    .array(
      z.object({
        filterSuffix: z.string().optional(),
        generation: z.enum(['gen1', 'gen2', 'gen3']).optional(),
        id: z.string().optional(),
        nonNullDocumentFields: z.boolean().optional(),
        playground: z.boolean().optional(),
        source: z.string().optional(),
        tag: z.string().optional(),
        workspace: z.string().optional(),
      }),
    )
    .optional(),

  mediaLibrary: z
    .object({
      aspectsPath: z.string().optional(),
    })
    .optional(),

  project: z
    .object({
      basePath: z.string().optional(),
    })
    .optional(),

  reactCompiler: z.custom<ReactCompilerConfig>().optional(),

  reactStrictMode: z.boolean().optional(),

  server: z
    .object({
      hostname: z.string().optional(),
      port: z.number().optional(),
    })
    .optional(),

  studioHost: z.string().optional(),

  vite: z.custom<UserViteConfig>().optional(),
}) satisfies z.ZodType<CliConfig>
