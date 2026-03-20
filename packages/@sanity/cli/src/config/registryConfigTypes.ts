/** @public */
export type RegistryTransform =
  | {
      importName: string
      importPath: string
      pluginCall: string
      type: 'sanityConfigPlugin'
    }
  | {
      importName: string
      importPath: string
      type: 'schemaTypeExport'
    }

/** @public */
export interface RegistryManifestFile {
  source: string
  target: string

  ifExists?: 'overwrite' | 'skip'
}

/** @public */
export interface RegistryManifestDependencies {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** @public */
export interface RegistryAuthoringConfig {
  name: string
  version: string

  conventions?: {
    componentsDir?: string
    filesDir?: string
    schemaDir?: string
  }
  dependencies?: RegistryManifestDependencies
  description?: string
  files?: RegistryManifestFile[]
  requires?: {
    sanity?: string
  }

  targets?: {
    components?: string
    files?: string
  }
  transforms?: RegistryTransform[]
}
