import {createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {getStudioConfig, getTimer, Output, spinner} from '@sanity/cli-core'
import {readPackageUp} from 'read-package-up'
import {z} from 'zod'

import {type ExtractManifestCommand} from '../../commands/manifest/extract'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {
  type CreateManifest,
  type CreateWorkspaceManifest,
  type ManifestWorkspaceFile,
} from './types'

export const MANIFEST_FILENAME = 'create-manifest.json'
const SCHEMA_FILENAME_SUFFIX = '.create-schema.json'
const TOOLS_FILENAME_SUFFIX = '.create-tools.json'

/** Escape-hatch env flags to change action behavior */
const FEATURE_ENABLED_ENV_NAME = 'SANITY_CLI_EXTRACT_MANIFEST_ENABLED'
const EXTRACT_MANIFEST_ENABLED = process.env[FEATURE_ENABLED_ENV_NAME] !== 'false'
const EXTRACT_MANIFEST_LOG_ERRORS = process.env.SANITY_CLI_EXTRACT_MANIFEST_LOG_ERRORS === 'true'

const CREATE_TIMER = 'create-manifest'

interface ExtractManifestOptions {
  flags: ExtractManifestCommand['flags']
  output: Output
  workDir: string
}

/**
 * This function will never throw.
 * @returns `undefined` if extract succeeded - caught error if it failed
 */
export async function extractManifestSafe(
  options: ExtractManifestOptions,
): Promise<Error | undefined> {
  if (!EXTRACT_MANIFEST_ENABLED) {
    return undefined
  }

  try {
    await extractManifest(options)
    return undefined
  } catch (err) {
    if (EXTRACT_MANIFEST_LOG_ERRORS) {
      options.output.error(err)
    }
    throw err
  }
}

async function extractManifest(options: ExtractManifestOptions): Promise<void> {
  const {flags, workDir} = options

  const defaultOutputDir = resolve(join(workDir, 'dist'))
  const outputDir = resolve(defaultOutputDir)
  const defaultStaticPath = join(outputDir, 'static')
  const staticPath = `.${flags.path ?? defaultStaticPath}`
  const path = join(staticPath, MANIFEST_FILENAME)
  const cwd = dirname(fileURLToPath(import.meta.url))

  const rootPkgPath = (await readPackageUp({cwd}))?.path
  if (!rootPkgPath) {
    throw new Error('Could not find root directory for `sanity` package')
  }

  const timer = getTimer()
  timer.start(CREATE_TIMER)
  const spin = spinner('Extracting manifest').start()

  try {
    const workspaceManifests = await getWorkspaceManifests({
      rootPkgPath,
      workDir,
    })

    await mkdir(staticPath, {recursive: true})

    const workspaceFiles = await writeWorkspaceFiles(workspaceManifests, staticPath)

    const manifest: CreateManifest = {
      /**
       * Version history:
       * 1: Initial release.
       * 2: Added tools file.
       * 3. Added studioVersion field.
       */
      createdAt: new Date().toISOString(),
      studioVersion: await readModuleVersion(workDir, 'sanity'),
      version: 3,
      workspaces: workspaceFiles,
    }

    await writeFile(path, JSON.stringify(manifest, null, 2))
    const manifestDuration = timer.end(CREATE_TIMER)

    spin.succeed(`Extracted manifest (${manifestDuration.toFixed(0)}ms)`)
  } catch (err) {
    spin.fail(err.message)
    throw err
  }
}

async function getWorkspaceManifests({
  rootPkgPath,
  workDir,
}: {
  rootPkgPath: string
  workDir: string
}): Promise<CreateWorkspaceManifest[]> {
  const workspaces = await getStudioConfig(workDir, {
    callback: {
      path: join(
        dirname(rootPkgPath),
        'dist',
        'actions',
        'manifest',
        'extractWorkspaceManifest.js',
      ),
      zodSchema: z.array(
        z.object({
          basePath: z.string(),
          dataset: z.string(),
          icon: z.string().optional(),
          mediaLibrary: z
            .object({
              enabled: z.boolean().optional(),
              libraryId: z.string().optional(),
            })
            .optional(),
          name: z.string(),
          projectId: z.string(),
          schema: z.unknown().optional(),
          subtitle: z.string().optional(),
          title: z.string(),
          tools: z
            .array(
              z.object({
                icon: z.string().optional(),
                name: z.string().optional(),
                title: z.string().optional(),
                type: z.string().nullable().optional(),
              }),
            )
            .optional(),
        }),
      ),
    },
    resolvePlugins: true,
  })

  return workspaces as unknown as CreateWorkspaceManifest[]
}

function writeWorkspaceFiles(
  manifestWorkspaces: CreateWorkspaceManifest[],
  staticPath: string,
): Promise<ManifestWorkspaceFile[]> {
  const output = manifestWorkspaces.map((workspace) => writeWorkspaceFile(workspace, staticPath))

  return Promise.all(output)
}

async function writeWorkspaceFile(
  workspace: CreateWorkspaceManifest,
  staticPath: string,
): Promise<ManifestWorkspaceFile> {
  const [schemaFilename, toolsFilename] = await Promise.all([
    createFile(staticPath, workspace.schema, SCHEMA_FILENAME_SUFFIX),
    createFile(staticPath, workspace.tools, TOOLS_FILENAME_SUFFIX),
  ])

  return {
    ...workspace,
    schema: schemaFilename,
    tools: toolsFilename,
  }
}

const createFile = async (path: string, content: unknown, filenameSuffix: string) => {
  const stringifiedContent = JSON.stringify(content, null, 2)
  const hash = createHash('sha1').update(stringifiedContent).digest('hex')
  const filename = `${hash.slice(0, 8)}${filenameSuffix}`

  // workspaces with identical data will overwrite each others file. This is ok, since they are identical and can be shared
  await writeFile(join(path, filename), stringifiedContent)

  return filename
}
