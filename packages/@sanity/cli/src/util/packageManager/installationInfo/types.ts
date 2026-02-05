import {type PackageManager} from '../packageManagerChoice.js'

export type WorkspaceType = 'npm-workspaces' | 'pnpm-workspaces' | 'standalone' | 'yarn-workspaces'

export type SanityPackage = '@sanity/cli' | 'sanity'

export interface CliInstallationInfo {
  currentExecution: ExecutionContext
  globalInstallations: GlobalInstallation[]
  issues: Issue[]
  packages: Partial<Record<SanityPackage, PackageInfo>>
  workspace: WorkspaceInfo
}

export interface ExecutionContext {
  binaryPath: string | null
  packageManager: PackageManager | null
  resolvedFrom: 'global' | 'local' | 'npx' | 'unknown'
}

export interface WorkspaceInfo {
  hasMultipleLockfiles: boolean
  lockfile: {
    path: string
    type: PackageManager
  } | null
  nearestPackageJson: string
  root: string
  type: WorkspaceType
}

export interface PackageInfo {
  declared: PackageDeclaration | null
  installed: InstalledPackage | null
  override: PackageOverride | null
}

export interface PackageDeclaration {
  declaredVersionRange: string
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies'
  packageJsonPath: string
  versionRange: string
}

export interface PackageOverride {
  mechanism: 'npm-overrides' | 'pnpm-overrides' | 'yarn-resolutions'
  packageJsonPath: string
  versionRange: string
}

export interface InstalledPackage {
  cliDependencyRange: string | null
  path: string
  version: string
}

export interface GlobalInstallation {
  isActive: boolean
  packageManager: PackageManager
  packageName: SanityPackage
  path: string
  version: string
}

export type IssueType =
  | 'cli-version-incompatible'
  | 'conflicting-cli-dependency'
  | 'declared-not-installed'
  | 'global-cli-incompatible'
  | 'global-local-mismatch'
  | 'multiple-lockfiles'
  | 'override-in-effect'
  | 'redundant-cli-dependency'

export type IssueSeverity = 'error' | 'info' | 'warning'

export interface Issue {
  message: string
  packageName: SanityPackage | null
  severity: IssueSeverity
  suggestion: string | null
  type: IssueType
}

export {type PackageManager} from '../packageManagerChoice.js'
