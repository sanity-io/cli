export interface PackageJson {
  name: string
  version: string

  author?: string

  dependencies?: Record<string, string>
  description?: string
  devDependencies?: Record<string, string>
  license?: string

  peerDependencies?: Record<string, string>
  private?: boolean
  repository?: {type: string; url: string}

  scripts?: Record<string, string>
}
