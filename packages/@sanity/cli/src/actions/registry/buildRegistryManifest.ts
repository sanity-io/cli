import {access, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, normalize, relative, resolve, sep} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core'
import {execa} from 'execa'
import {z} from 'zod'

import {
  type RegistryAuthoringConfig,
  type RegistryManifest,
  type RegistryManifestFile,
} from './types.js'

const AUTHORING_CONFIG_FILENAME = 'registry.source.json'
const MANIFEST_FILENAME = 'sanity-registry.json'
const AUTHORING_CONFIG_CANDIDATES = [
  'registry.source.ts',
  'registry.source.mts',
  'registry.source.js',
  'registry.source.mjs',
  'registry.source.json',
]

const authoringConfigSchema = z.object({
  conventions: z
    .object({
      componentsDir: z.string().optional(),
      filesDir: z.string().optional(),
      schemaDir: z.string().optional(),
    })
    .optional(),
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
    .optional(),
  name: z.string().min(1),
  requires: z
    .object({
      sanity: z.string().optional(),
    })
    .optional(),
  targets: z
    .object({
      components: z.string().optional(),
      files: z.string().optional(),
    })
    .optional(),
  transforms: z
    .array(
      z.discriminatedUnion('type', [
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
      ]),
    )
    .optional(),
  version: z.string().min(1),
})

interface BuildRegistryManifestOptions {
  dryRun: boolean
  registryDirectory: string
}

interface BuildRegistryManifestResult {
  manifest: RegistryManifest
  manifestPath: string
  scannedDirectories: string[]
}

export async function buildRegistryManifest(
  options: BuildRegistryManifestOptions,
): Promise<BuildRegistryManifestResult> {
  const {dryRun, registryDirectory} = options
  const authoringConfig = await loadAuthoringConfig(registryDirectory)
  const entries = await inferFilesFromConventions(registryDirectory, authoringConfig)
  const mergedFiles = dedupeManifestFiles([...(authoringConfig.files ?? []), ...entries.files])

  const manifest: RegistryManifest = {
    dependencies: authoringConfig.dependencies,
    description: authoringConfig.description,
    files: mergedFiles,
    name: authoringConfig.name,
    requires: authoringConfig.requires,
    transforms: authoringConfig.transforms,
    version: authoringConfig.version,
  }

  const manifestPath = join(registryDirectory, MANIFEST_FILENAME)
  if (!dryRun) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }

  return {
    manifest,
    manifestPath,
    scannedDirectories: entries.scannedDirectories,
  }
}

async function loadAuthoringConfig(registryDirectory: string): Promise<RegistryAuthoringConfig> {
  const configPath = await findAuthoringConfigPath(registryDirectory)
  if (!configPath) {
    throw new Error(
      `Could not find a registry source config in "${registryDirectory}". Expected one of: ${AUTHORING_CONFIG_CANDIDATES.join(', ')}`,
    )
  }

  const parsed = await loadConfigObject(configPath)

  const result = authoringConfigSchema.safeParse(parsed)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`${AUTHORING_CONFIG_FILENAME} is invalid:\n${details}`)
  }

  return result.data satisfies RegistryAuthoringConfig
}

async function findAuthoringConfigPath(registryDirectory: string): Promise<string | undefined> {
  for (const candidate of AUTHORING_CONFIG_CANDIDATES) {
    const candidatePath = join(registryDirectory, candidate)
    if (await pathExists(candidatePath)) {
      return candidatePath
    }
  }

  return undefined
}

async function loadConfigObject(configPath: string): Promise<unknown> {
  if (configPath.endsWith('.json')) {
    const raw = await readFile(configPath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (error) {
      throw new Error(
        `${AUTHORING_CONFIG_FILENAME} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (configPath.endsWith('.js') || configPath.endsWith('.mjs')) {
    const moduleValue = await doImport(configPath)
    return moduleValue.default ?? moduleValue
  }

  if (configPath.endsWith('.ts') || configPath.endsWith('.mts')) {
    return loadTsConfig(configPath)
  }

  throw new Error(`Unsupported registry source config format: ${configPath}`)
}

async function loadTsConfig(configPath: string): Promise<unknown> {
  const moduleUrl = pathToFileURL(configPath).href
  const loaderTmpDir = await mkdtemp(join(tmpdir(), 'sanity-registry-loader-'))
  const loaderScriptPath = join(loaderTmpDir, 'load-config.mjs')
  const loaderScript = [
    'import(process.argv[2])',
    '.then((mod) => {',
    '  const config = mod.default ?? mod;',
    '  process.stdout.write(JSON.stringify(config));',
    '})',
    '.catch((err) => {',
    '  process.stderr.write(String(err));',
    '  process.exit(1);',
    '});',
  ].join('')

  await writeFile(loaderScriptPath, loaderScript, 'utf8')
  const result = await (async () => {
    try {
      const tsxCliPath = resolveTsxCliPath()
      return await execa(process.execPath, [tsxCliPath, loaderScriptPath, moduleUrl], {
        reject: false,
      })
    } finally {
      await rm(loaderTmpDir, {force: true, recursive: true})
    }
  })()

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to load TypeScript registry source config "${configPath}": ${result.stderr || 'Unknown error'}`,
    )
  }

  if (!result.stdout) {
    throw new Error(
      `TypeScript registry source config "${configPath}" did not export a config object.`,
    )
  }

  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(
      `TypeScript registry source config "${configPath}" did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function resolveTsxCliPath(): string {
  const require = createRequire(import.meta.url)

  try {
    const tsxPackageJsonPath = require.resolve('tsx/package.json')
    return join(dirname(tsxPackageJsonPath), 'dist', 'cli.mjs')
  } catch {
    throw new Error(
      'TypeScript registry config loading requires "tsx". Ensure @sanity/cli dependencies are installed.',
    )
  }
}

async function inferFilesFromConventions(
  registryDirectory: string,
  config: RegistryAuthoringConfig,
): Promise<{files: RegistryManifestFile[]; scannedDirectories: string[]}> {
  const conventions = {
    componentsDir: config.conventions?.componentsDir ?? 'src/components',
    filesDir: config.conventions?.filesDir ?? 'src/files',
    schemaDir: config.conventions?.schemaDir ?? 'src/schema-types',
  }

  const targets = {
    components: config.targets?.components ?? 'src/components',
    files: config.targets?.files ?? '',
  }

  const allEntries: RegistryManifestFile[] = []
  const scannedDirectories: string[] = []

  allEntries.push(
    ...(await collectConventionFiles({
      registryDirectory,
      sourceDir: conventions.schemaDir,
      targetDir: '{schemaDir}',
    })),
  )
  scannedDirectories.push(conventions.schemaDir)

  allEntries.push(
    ...(await collectConventionFiles({
      registryDirectory,
      sourceDir: conventions.componentsDir,
      targetDir: targets.components,
    })),
  )
  scannedDirectories.push(conventions.componentsDir)

  allEntries.push(
    ...(await collectConventionFiles({
      registryDirectory,
      sourceDir: conventions.filesDir,
      targetDir: targets.files,
    })),
  )
  scannedDirectories.push(conventions.filesDir)

  return {files: allEntries, scannedDirectories}
}

async function collectConventionFiles(options: {
  registryDirectory: string
  sourceDir: string
  targetDir: string
}): Promise<RegistryManifestFile[]> {
  const {registryDirectory, sourceDir, targetDir} = options
  const sourceRoot = resolve(registryDirectory, normalizeRelativePath(sourceDir))
  const rootRelative = relative(resolve(registryDirectory), sourceRoot)
  if (rootRelative.startsWith('..')) {
    throw new Error(
      `Invalid convention directory "${sourceDir}". It must be inside the registry root.`,
    )
  }

  const exists = await pathExists(sourceRoot)
  if (!exists) return []

  const allFiles = await walkFiles(sourceRoot)
  return allFiles.map((absoluteFilePath) => {
    const fromConventionRoot = toPosix(relative(sourceRoot, absoluteFilePath))
    const normalizedSourceRoot = toPosix(normalizeRelativePath(sourceDir))
    const sourcePath = joinPosix(normalizedSourceRoot, fromConventionRoot)
    const targetPath = joinPosix(toPosix(targetDir), fromConventionRoot)
    return {
      source: sourcePath,
      target: targetPath,
    }
  })
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)))
      continue
    }

    if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function dedupeManifestFiles(files: RegistryManifestFile[]): RegistryManifestFile[] {
  const seen = new Map<string, RegistryManifestFile>()
  for (const file of files) {
    const key = `${file.source}::${file.target}`
    seen.set(key, file)
  }
  return [...seen.values()].toSorted((a, b) => a.source.localeCompare(b.source))
}

function normalizeRelativePath(path: string): string {
  return normalize(path)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '')
}

function joinPosix(base: string, path: string): string {
  const cleanBase = base.endsWith('/') || base === '' ? base.slice(0, -1) : base
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  if (!cleanBase) return cleanPath
  if (!cleanPath) return cleanBase
  return `${cleanBase}/${cleanPath}`
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}
