import {z} from 'zod'

export const cliConfigSchema = z.object({
  api: z
    .object({
      dataset: z.string().optional(),
      projectId: z.string().optional(),
    })
    .optional(),

  autoUpdates: z.boolean().optional(),

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

  project: z
    .object({
      basePath: z.string().optional(),
    })
    .optional(),

  reactCompiler: z
    .object({
      compilationMode: z.enum(['all', 'annotation', 'infer', 'syntax']).optional(),
      panicThreshold: z.enum(['ALL_ERRORS', 'CRITICAL_ERRORS', 'NONE']).optional(),
      sources: z
        .union([z.function().args(z.string()).returns(z.boolean()), z.array(z.string()), z.null()])
        .optional(),
      target: z.enum(['18', '19']),
    })
    .optional(),

  reactStrictMode: z.boolean().optional(),

  server: z
    .object({
      hostname: z.string().optional(),
      port: z.number().optional(),
    })
    .optional(),

  studioHost: z.string().optional(),

  vite: z.union([z.function(), z.object({}).passthrough()]).optional(),
})
