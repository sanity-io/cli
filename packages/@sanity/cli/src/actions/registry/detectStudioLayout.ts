import {access} from 'node:fs/promises'
import {join, relative} from 'node:path'

import {tryFindStudioConfigPath} from '@sanity/cli-core'

import {readJsonFile} from '../../util/packageManager/installationInfo/readJsonFile.js'
import {type RegistryProjectConfig, type StudioLayout} from './types.js'

const DEFAULT_CONFIG: RegistryProjectConfig = {
  customInputDirCandidates: ['src/components/inputs', 'components/inputs'],
  defaultConflictPolicy: 'skip',
  schemaDirCandidates: ['schemaTypes', 'schema', 'schemas'],
}

const REGISTRY_CONFIG_FILE = '.sanity/registry.config.json'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function detectStudioLayout(projectRoot: string): Promise<StudioLayout> {
  const projectConfig = await loadProjectRegistryConfig(projectRoot)
  const studioConfigPath = await tryFindStudioConfigPath(projectRoot)
  if (!studioConfigPath) {
    throw new Error(
      `Unable to find Sanity Studio config in "${projectRoot}". Expected a "sanity.config.*" file.`,
    )
  }

  const schemaDirectory = await detectSchemaDirectory(
    projectRoot,
    projectConfig.schemaDirCandidates,
  )
  const schemaIndexPath = await detectSchemaIndexPath(projectRoot, schemaDirectory)

  return {
    schemaDirectory,
    schemaIndexPath,
    studioConfigPath,
  }
}

async function loadProjectRegistryConfig(projectRoot: string): Promise<RegistryProjectConfig> {
  const configPath = join(projectRoot, REGISTRY_CONFIG_FILE)
  const localConfig = await readJsonFile<Partial<RegistryProjectConfig>>(configPath)

  if (!localConfig) return DEFAULT_CONFIG

  return {
    customInputDirCandidates:
      localConfig.customInputDirCandidates ?? DEFAULT_CONFIG.customInputDirCandidates,
    defaultConflictPolicy:
      localConfig.defaultConflictPolicy ?? DEFAULT_CONFIG.defaultConflictPolicy,
    schemaDirCandidates: localConfig.schemaDirCandidates ?? DEFAULT_CONFIG.schemaDirCandidates,
  }
}

async function detectSchemaDirectory(projectRoot: string, candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    const absoluteCandidate = join(projectRoot, candidate)
    if (await fileExists(absoluteCandidate)) {
      return relative(projectRoot, absoluteCandidate)
    }
  }

  return candidates[0] ?? 'schemaTypes'
}

async function detectSchemaIndexPath(
  projectRoot: string,
  schemaDirectory: string,
): Promise<string> {
  const indexCandidates = ['index.ts', 'index.js', 'index.mjs'].map((filename) =>
    join(projectRoot, schemaDirectory, filename),
  )

  for (const candidate of indexCandidates) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  return indexCandidates[0]
}
