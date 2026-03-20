import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {z} from 'zod'

import {type RegistryManifest} from './types.js'

const manifestFileName = 'sanity-registry.json'

const registryTransformSchema = z.discriminatedUnion('type', [
  z.object({
    importName: z.string().min(1),
    importPath: z.string().min(1),
    pluginCall: z.string().min(1),
    type: z.literal('sanityConfigPlugin'),
  }),
  z.object({
    importName: z.string().min(1),
    importPath: z.string().min(1),
    type: z.literal('schemaTypeExport'),
  }),
])

const registryManifestSchema = z.object({
  dependencies: z
    .object({
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  description: z.string().optional(),
  files: z
    .array(
      z.object({
        ifExists: z.enum(['overwrite', 'skip']).optional(),
        source: z.string().min(1),
        target: z.string().min(1),
      }),
    )
    .default([]),
  name: z.string().min(1),
  requires: z
    .object({
      sanity: z.string().optional(),
    })
    .optional(),
  transforms: z.array(registryTransformSchema).optional(),
  version: z.string().min(1),
})

export async function loadRegistryManifest(directory: string): Promise<RegistryManifest> {
  const manifestPath = join(directory, manifestFileName)
  let rawManifest: string

  try {
    rawManifest = await readFile(manifestPath, 'utf8')
  } catch {
    throw new Error(`Could not find ${manifestFileName} in "${directory}"`)
  }

  let parsedManifest: unknown
  try {
    parsedManifest = JSON.parse(rawManifest)
  } catch (error) {
    throw new Error(
      `${manifestFileName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = registryManifestSchema.safeParse(parsedManifest)
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`${manifestFileName} is invalid:\n${formatted}`)
  }

  return result.data satisfies RegistryManifest
}
