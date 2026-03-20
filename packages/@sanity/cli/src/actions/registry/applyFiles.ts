import {access, copyFile, mkdir} from 'node:fs/promises'
import {dirname, join, normalize, relative, resolve} from 'node:path'

import {type RegistryManifest, type StudioLayout} from './types.js'

interface ApplyFilesOptions {
  dryRun: boolean
  manifest: RegistryManifest
  overwrite: boolean
  projectRoot: string
  registryDirectory: string
  studioLayout: StudioLayout
}

interface ApplyFilesResult {
  addedFiles: string[]
  manualSteps: string[]
  skippedFiles: Array<{file: string; reason: string}>
  updatedFiles: string[]
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function applyFiles(options: ApplyFilesOptions): Promise<ApplyFilesResult> {
  const {dryRun, manifest, overwrite, projectRoot, registryDirectory, studioLayout} = options
  const addedFiles: string[] = []
  const manualSteps: string[] = []
  const skippedFiles: Array<{file: string; reason: string}> = []
  const updatedFiles: string[] = []
  const hasSrcDirectory = await pathExists(join(projectRoot, 'src'))

  for (const fileEntry of manifest.files) {
    const sourcePath = join(registryDirectory, normalizeRegistryPath(fileEntry.source))
    const resolvedTarget = resolveTargetTemplate(
      fileEntry.target,
      studioLayout,
      projectRoot,
      hasSrcDirectory,
    )
    const targetPath = resolve(projectRoot, resolvedTarget)
    const rootPath = resolve(projectRoot)
    const relativeTargetPath = relative(rootPath, targetPath)
    if (relativeTargetPath.startsWith('..')) {
      throw new Error(
        `Invalid registry target path "${fileEntry.target}". Target must remain inside the project root.`,
      )
    }

    const targetExists = await pathExists(targetPath)
    const shouldOverwrite = overwrite || fileEntry.ifExists === 'overwrite'

    if (targetExists && !shouldOverwrite) {
      skippedFiles.push({
        file: relative(projectRoot, targetPath),
        reason: 'already exists',
      })
      continue
    }

    if (dryRun) {
      if (targetExists) {
        updatedFiles.push(relative(projectRoot, targetPath))
      } else {
        addedFiles.push(relative(projectRoot, targetPath))
      }
      continue
    }

    await mkdir(dirname(targetPath), {recursive: true})
    await copyFile(sourcePath, targetPath)

    if (targetExists) {
      updatedFiles.push(relative(projectRoot, targetPath))
    } else {
      addedFiles.push(relative(projectRoot, targetPath))
    }
  }

  if (manifest.files.length === 0) {
    manualSteps.push('Registry manifest contains no file entries.')
  }

  return {addedFiles, manualSteps, skippedFiles, updatedFiles}
}

function normalizeRegistryPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\/+/, '')
  if (normalized.includes('..')) {
    throw new Error(
      `Invalid registry file path "${path}". Relative parent segments are not allowed.`,
    )
  }
  return normalize(normalized)
}

function resolveTargetTemplate(
  target: string,
  studioLayout: StudioLayout,
  projectRoot: string,
  hasSrcDirectory: boolean,
): string {
  const relativeConfigPath = relative(projectRoot, studioLayout.studioConfigPath)
  const resolved = target
    .replaceAll('{schemaDir}', studioLayout.schemaDirectory)
    .replaceAll('{studioConfigPath}', relativeConfigPath)

  // Registry authors can use src-first conventions, but installations should not
  // create a new src root unless the target project already uses one.
  if (!hasSrcDirectory && resolved.startsWith('src/')) {
    return resolved.slice(4)
  }

  return resolved
}
