// Command helpers
export {getFixCommands, getUpgradeCommands} from './commands.js'
// Main entry point
export {detectCliInstallation} from './detectCliInstallation.js'

export type {DetectCliInstallationOptions} from './detectCliInstallation.js'

// Types
export type {
  CliInstallationInfo,
  ExecutionContext,
  GlobalInstallation,
  InstalledPackage,
  Issue,
  IssueSeverity,
  IssueType,
  PackageDeclaration,
  PackageInfo,
  PackageManager,
  PackageOverride,
  SanityPackage,
  WorkspaceInfo,
  WorkspaceType,
} from './types.js'
