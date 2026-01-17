/**
 * @public
 */
export interface PackageJson {
  name: string
  version: string

  author?: string
  dependencies?: Record<string, string>
  description?: string
  devDependencies?: Record<string, string>
  engines?: Record<string, string>
  license?: string
  peerDependencies?: Record<string, string>
  private?: boolean
  repository?: {type: string; url: string}
  scripts?: Record<string, string>
}

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
