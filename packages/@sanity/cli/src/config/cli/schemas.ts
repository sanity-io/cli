import {z} from 'zod'

export const reactCompilerSchema = z
  .object({
    compilationMode: z.enum(['all', 'annotation', 'infer', 'syntax']).optional(),
    panicThreshold: z.enum(['ALL_ERRORS', 'CRITICAL_ERRORS', 'NONE']).optional(),
    /**
     * @see https://react.dev/learn/react-compiler#existing-projects
     */
    sources: z
      .union([z.function().args(z.string()).returns(z.boolean()), z.array(z.string()), z.null()])
      .optional(),
    /**
     * The minimum major version of React that the compiler should emit code for. If the target is 19
     * or higher, the compiler emits direct imports of React runtime APIs needed by the compiler. On
     * versions prior to 19, an extra runtime package react-compiler-runtime is necessary to provide
     * a userspace approximation of runtime APIs.
     * @see https://react.dev/learn/react-compiler#using-react-compiler-with-react-17-or-18
     */
    target: z.enum(['18', '19']),
  })
  .optional()

export const cliConfigSchema = z.object({
  /**
   * API configuration
   */
  api: z
    .object(
      {
        dataset: z.string().optional(),
        projectId: z.string().optional(),
      },
      {description: 'API configuration'},
    )
    .optional(),

  app: z
    .object({
      entry: z.string().optional(),
      id: z.string().optional(),
      organizationId: z.string().optional(),
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

  reactCompiler: reactCompilerSchema,

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
