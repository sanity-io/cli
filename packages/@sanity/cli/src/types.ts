/**
 * PackageJson type is now consolidated in readPackageJson.ts
 * Re-exported here for backward compatibility.
 *
 * @public
 */
export type {PackageJson, ReadPackageJsonOptions} from '@sanity/cli-core'

export interface CliApiConfig {
  dataset?: string
  projectId?: string
}

export interface SanityJson {
  __experimental_spaces?: {
    api: {
      dataset?: string
      projectId?: string
    }
    default?: true
    name: string
    title: string
  }[]
  api?: CliApiConfig
  env?: {
    development?: SanityJson
    production?: SanityJson
    staging?: SanityJson
  }
  parts?: {
    description?: string
    implements?: string
    name?: string
    path?: string
  }[]
  plugins?: string[]
  project?: {
    basePath?: string
    name?: string
  }
  root?: boolean
}
