import {type Output} from '@sanity/cli-core'

import {
  type RegistryManifestDependencies,
  type RegistryManifestFile,
  type RegistryTransform,
} from '../../config/registryConfigTypes.js'

export interface RegistryManifest {
  files: RegistryManifestFile[]
  name: string
  version: string

  dependencies?: RegistryManifestDependencies
  description?: string
  requires?: {
    sanity?: string
  }
  transforms?: RegistryTransform[]
}

export interface StudioLayout {
  schemaDirectory: string
  schemaIndexPath: string
  studioConfigPath: string
}

export interface RegistryProjectConfig {
  customInputDirCandidates: string[]
  defaultConflictPolicy: 'overwrite' | 'skip'
  schemaDirCandidates: string[]
}

export interface AddRegistryOptions {
  dryRun: boolean
  local: boolean
  output: Output
  overwrite: boolean
  projectRoot: string
  source: string
  unattended: boolean

  ref?: string
  subdir?: string
}

export interface AddRegistryResult {
  addedFiles: string[]
  dryRun: boolean
  manifest: RegistryManifest
  manualSteps: string[]
  projectRoot: string
  skippedFiles: Array<{file: string; reason: string}>
  updatedFiles: string[]
}

export interface ResolvedRegistrySource {
  cleanup: () => Promise<void>
  directory: string
  sourceLabel: string
}

export {
  type RegistryAuthoringConfig,
  type RegistryManifestDependencies,
  type RegistryManifestFile,
  type RegistryTransform,
} from '../../config/registryConfigTypes.js'
