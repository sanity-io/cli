import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {z} from 'zod/mini'

import {type CliConfig, type TypeGenConfig} from './types/cliConfig'
import {type UserViteConfig} from './types/userViteConfig'

/**
 * @public
 */
export const cliConfigSchema = z.object({
  api: z.optional(
    z.object({
      dataset: z.optional(z.string()),
      projectId: z.optional(z.string()),
    }),
  ),

  app: z.optional(
    z.object({
      entry: z.optional(z.string()),
      icon: z.optional(z.string()),
      id: z.optional(z.string()),
      organizationId: z.optional(z.string()),
      title: z.optional(z.string()),
    }),
  ),

  autoUpdates: z.optional(z.boolean()),

  deployment: z.optional(
    z.object({
      appId: z.optional(z.string()),
      autoUpdates: z.optional(z.boolean()),
    }),
  ),

  federation: z.optional(
    z.object({
      enabled: z.boolean(),
    }),
  ),

  graphql: z.optional(
    z.array(
      z.object({
        filterSuffix: z.optional(z.string()),
        generation: z.optional(z.enum(['gen1', 'gen2', 'gen3'])),
        id: z.optional(z.string()),
        nonNullDocumentFields: z.optional(z.boolean()),
        playground: z.optional(z.boolean()),
        source: z.optional(z.string()),
        tag: z.optional(z.string()),
        workspace: z.optional(z.string()),
      }),
    ),
  ),

  mediaLibrary: z.optional(
    z.object({
      aspectsPath: z.optional(z.string()),
    }),
  ),

  project: z.optional(
    z.object({
      basePath: z.optional(z.string()),
    }),
  ),

  reactCompiler: z.optional(z.custom<ReactCompilerConfig>()),

  reactStrictMode: z.optional(z.boolean()),

  schemaExtraction: z.optional(
    z.object({
      enabled: z.optional(z.boolean()),
      enforceRequiredFields: z.optional(z.boolean()),
      path: z.optional(z.string()),
      watchPatterns: z.optional(z.array(z.string())),
      workspace: z.optional(z.string()),
    }),
  ),

  server: z.optional(
    z.object({
      hostname: z.optional(z.string()),
      port: z.optional(z.number()),
    }),
  ),

  studioHost: z.optional(z.string()),

  vite: z.optional(z.custom<UserViteConfig>()),

  typegen: z.optional(z.custom<Partial<TypeGenConfig> & {enabled?: boolean}>()),
}) satisfies z.core.$ZodType<CliConfig>
