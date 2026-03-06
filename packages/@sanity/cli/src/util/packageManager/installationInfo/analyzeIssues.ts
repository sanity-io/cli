import semver from 'semver'

import {
  getGlobalUninstallCommand,
  getLocalRemoveCommand,
  getLocalUpdateCommand,
} from './commands.js'
import {
  type GlobalInstallation,
  type Issue,
  type LockfileType,
  type PackageInfo,
  type SanityPackage,
  type WorkspaceInfo,
} from './types.js'

/**
 * Analyzes package information and workspace configuration to detect potential issues.
 */
export function analyzeIssues(
  packages: Partial<Record<SanityPackage, PackageInfo>>,
  workspace: WorkspaceInfo,
  globals: GlobalInstallation[],
): Issue[] {
  const issues: Issue[] = []
  const pm: LockfileType = workspace.lockfile?.type ?? inferPackageManager(workspace.type)

  // Check for multiple lockfiles
  if (workspace.hasMultipleLockfiles) {
    issues.push({
      message: 'Multiple lockfiles found. This can cause inconsistent installations.',
      packageName: null,
      severity: 'warning',
      suggestion: 'Remove all but one lockfile and use a single package manager.',
      type: 'multiple-lockfiles',
    })
  }

  // Check each package for issues
  for (const [name, info] of Object.entries(packages) as [
    SanityPackage,
    PackageInfo | undefined,
  ][]) {
    if (!info) continue

    // declared-not-installed
    if (info.declared && !info.installed) {
      issues.push({
        message: `${name} is declared in package.json but not installed.`,
        packageName: name,
        severity: 'error',
        suggestion: `Run: ${pm} install`,
        type: 'declared-not-installed',
      })
    }

    // override-in-effect
    if (info.override) {
      issues.push({
        message: `${name} has an override (${info.override.mechanism}) set to ${info.override.versionRange}.`,
        packageName: name,
        severity: 'info',
        suggestion: null,
        type: 'override-in-effect',
      })
    }

    // global-local-mismatch — only warn on major version differences
    // Check all global installations, not just the first match.
    // Skip @sanity/cli here — global-cli-incompatible (below) handles it with
    // better context by checking against sanity's actual required range.
    if (info.installed && name !== '@sanity/cli') {
      const localMajor = semver.parse(info.installed.version)?.major
      if (localMajor !== undefined) {
        for (const globalMatch of globals.filter((g) => g.packageName === name)) {
          const globalMajor = semver.parse(globalMatch.version)?.major
          if (globalMajor !== undefined && globalMajor !== localMajor) {
            issues.push({
              message: `${name} version mismatch: global ${globalMatch.version} (${globalMatch.packageManager}) vs local ${info.installed.version}.`,
              packageName: name,
              severity: globalMatch.isActive ? 'warning' : 'info',
              suggestion: `Run: ${getGlobalUninstallCommand(globalMatch.packageManager, name)}`,
              type: 'global-local-mismatch',
            })
          }
        }
      }
    }
  }

  // Check @sanity/cli compatibility with sanity
  const sanityInfo = packages.sanity
  const cliInfo = packages['@sanity/cli']

  if (sanityInfo?.installed?.cliDependencyRange) {
    const expectedCliRange = sanityInfo.installed.cliDependencyRange

    // Check if @sanity/cli is explicitly declared with an incompatible version.
    // Skip when the declared range uses a non-semver protocol (workspace:*, file:,
    // portal:, link:) — these are local package references, not version conflicts.
    if (cliInfo?.declared && !isNonSemverProtocol(cliInfo.declared.versionRange)) {
      const declaredRange = cliInfo.declared.versionRange
      // Only flag as redundant when every version in the declared range also
      // satisfies the required range. semver.subset('^5.0.0', '^5.33.0') → false,
      // so a too-wide range is correctly classified as conflicting.
      if (safeSubset(declaredRange, expectedCliRange)) {
        issues.push({
          message: `@sanity/cli is listed as a dependency but is already provided by sanity. Remove it to avoid version conflicts.`,
          packageName: '@sanity/cli',
          severity: 'info',
          suggestion: `Run: ${getLocalRemoveCommand(pm, '@sanity/cli')}`,
          type: 'redundant-cli-dependency',
        })
      } else {
        issues.push({
          message: `@sanity/cli is declared as ${declaredRange} but sanity requires ${expectedCliRange}.`,
          packageName: '@sanity/cli',
          severity: 'error',
          suggestion: `Run: ${getLocalRemoveCommand(pm, '@sanity/cli')}`,
          type: 'conflicting-cli-dependency',
        })
      }
    }

    // Check if installed @sanity/cli satisfies sanity's requirement.
    // Skip if we already flagged a conflicting declaration — that's the root cause.
    const hasConflictingDeclaration = issues.some((i) => i.type === 'conflicting-cli-dependency')
    if (cliInfo?.installed && !hasConflictingDeclaration) {
      const installedVersion = cliInfo.installed.version
      if (!semver.satisfies(installedVersion, expectedCliRange)) {
        issues.push({
          message: `Installed @sanity/cli@${installedVersion} does not satisfy sanity's requirement of ${expectedCliRange}.`,
          packageName: '@sanity/cli',
          severity: 'error',
          suggestion: `Run: ${getLocalUpdateCommand(pm, '@sanity/cli')}`,
          type: 'cli-version-incompatible',
        })
      }
    }

    // Check if @sanity/cli is missing entirely (not declared, not installed)
    // This indicates a broken node_modules state since sanity depends on @sanity/cli.
    if (!cliInfo?.installed && !cliInfo?.declared) {
      issues.push({
        message: `@sanity/cli is not installed. It is required by sanity@${sanityInfo.installed.version}.`,
        packageName: '@sanity/cli',
        severity: 'error',
        suggestion: `Run: ${pm} install`,
        type: 'cli-not-installed',
      })
    }

    // Check global @sanity/cli compatibility with local sanity
    const compatRange = toCaretRange(expectedCliRange)

    for (const global of globals) {
      if (global.packageName !== '@sanity/cli') continue

      if (!semver.satisfies(global.version, compatRange)) {
        issues.push({
          message: `Global @sanity/cli@${global.version} (installed via ${global.packageManager}) is incompatible with local sanity@${sanityInfo.installed.version} (requires @sanity/cli ${compatRange}).`,
          packageName: '@sanity/cli',
          severity: global.isActive ? 'warning' : 'info',
          suggestion: `Run: ${getGlobalUninstallCommand(global.packageManager, '@sanity/cli')}`,
          type: 'global-cli-incompatible',
        })
      }
    }
  }

  return issues
}

/**
 * Protocols and prefixes that are not semver ranges.
 * Includes local package references (workspace:, file:, portal:, link:),
 * catalog: which may appear as an unresolved range when pnpm catalog lookup fails,
 * and git/URL-based dependency specifiers.
 */
const NON_SEMVER_PROTOCOLS = [
  'workspace:',
  'file:',
  'portal:',
  'link:',
  'catalog:',
  'git+',
  'git:',
  'github:',
  'https:',
  'http:',
]

function isNonSemverProtocol(range: string): boolean {
  return NON_SEMVER_PROTOCOLS.some((p) => range.startsWith(p))
}

/**
 * Infers the package manager from the workspace type when no lockfile is present.
 */
function inferPackageManager(workspaceType: WorkspaceInfo['type']): LockfileType {
  if (workspaceType.startsWith('pnpm')) return 'pnpm'
  if (workspaceType.startsWith('yarn')) return 'yarn'
  if (workspaceType.startsWith('bun')) return 'bun'
  return 'npm'
}

/**
 * Safe wrapper around semver.subset that returns false for non-semver ranges
 * like workspace:*, catalog:, file:, or git URLs instead of throwing.
 */
function safeSubset(sub: string, sup: string): boolean {
  try {
    return semver.subset(sub, sup) ?? false
  } catch {
    return false
  }
}

/**
 * Converts a pinned version like "5.33.0" to "^5.33.0".
 * If it's already a range (^, ~, \>=, etc.), returns as-is.
 */
function toCaretRange(range: string): string {
  // If it's already a range operator, return as-is
  if (/^[\^~><!=]/.test(range) || range.includes(' ')) {
    return range
  }
  // If it's a plain version like "5.33.0", treat as ^5.33.0
  if (semver.valid(range)) {
    return `^${range}`
  }
  return range
}
