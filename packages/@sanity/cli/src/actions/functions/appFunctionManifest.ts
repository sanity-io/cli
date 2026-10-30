import {mkdir, readFile, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {isStaging} from '@sanity/cli-core/util'
import {z} from 'zod'

const manifestSchema = z.object({
  appId: z.string().min(1),
  environment: z.enum(['production', 'staging']),
  functions: z.array(z.object({name: z.string().regex(/^[^./\\][^/\\]*$/)})),
  organizationId: z.string().min(1),
  stackId: z.string().min(1).optional(),
  version: z.literal(1),
})

export type AppFunctionManifest = z.infer<typeof manifestSchema>

function manifestPath(workDir: string): string {
  return path.join(workDir, '.sanity', 'functions', '.manifest.json')
}

export async function hasAppFunctionBuild(workDir: string): Promise<boolean> {
  try {
    return (await stat(manifestPath(workDir))).isFile()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

export async function writeAppFunctionManifest(
  workDir: string,
  manifest: Omit<AppFunctionManifest, 'environment' | 'version'>,
): Promise<void> {
  const file = manifestPath(workDir)
  await mkdir(path.dirname(file), {recursive: true})
  await writeFile(
    file,
    `${JSON.stringify(
      {...manifest, environment: isStaging() ? 'staging' : 'production', version: 1},
      null,
      2,
    )}\n`,
  )
}

/** Validate the build snapshot, including when deploy runs with --no-build. */
export async function readAppFunctionManifest({
  appId,
  organizationId,
  stackId,
  workDir,
}: {
  appId: string | undefined
  organizationId: string
  stackId?: string
  workDir: string
}): Promise<AppFunctionManifest> {
  try {
    const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath(workDir), 'utf8')))
    if (
      manifest.appId !== appId ||
      manifest.organizationId !== organizationId ||
      (stackId && manifest.stackId !== stackId) ||
      manifest.environment !== (isStaging() ? 'staging' : 'production')
    ) {
      throw new Error(
        'The function build belongs to a different app, stack, organization, or environment.',
      )
    }
    const names = new Set<string>()
    // Package export; doImport accepts filesystem paths.
    // eslint-disable-next-line no-restricted-syntax
    const {readFunctionBuild} = await import('@sanity/runtime-cli/functions/build')
    for (const {name} of manifest.functions) {
      const key = name.toLowerCase()
      if (names.has(key)) throw new Error(`Duplicate function "${name}" in the build manifest.`)
      names.add(key)
      await readFunctionBuild({name, src: path.join('.sanity', 'functions', name), workDir})
    }
    return manifest
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot deploy the function build: ${message} Run sanity build, or deploy without --no-build.`,
      {cause: error},
    )
  }
}
