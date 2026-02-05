import semver from 'semver'

import {getGlobalUninstallCommand, getLocalRemoveCommand} from './commands.js'
import {
  type GlobalInstallation,
  type Issue,
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
  const pm = workspace.lockfile?.type || 'npm'

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
  for (const [name, info] of Object.entries(packages) as [SanityPackage, PackageInfo][]) {
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

    // global-local-mismatch
    const globalMatch = globals.find((g) => g.packageName === name)
    if (globalMatch && info.installed && globalMatch.version !== info.installed.version) {
      issues.push({
        message: `${name} version mismatch: global ${globalMatch.version} vs local ${info.installed.version}.`,
        packageName: name,
        severity: 'warning',
        suggestion: globalMatch.isActive
          ? 'Consider updating the global installation or using npx to use the local version.'
          : null,
        type: 'global-local-mismatch',
      })
    }
  }

  // Check @sanity/cli compatibility with sanity
  const sanityInfo = packages.sanity
  const cliInfo = packages['@sanity/cli']

  if (sanityInfo?.installed?.cliDependencyRange) {
    const expectedCliRange = sanityInfo.installed.cliDependencyRange

    // Check if @sanity/cli is explicitly declared with an incompatible version
    if (cliInfo?.declared) {
      const declaredRange = cliInfo.declared.versionRange
      // Check if the declared range could conflict with what sanity expects
      if (rangesOverlap(declaredRange, expectedCliRange)) {
        // Declared but compatible - redundant
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

    // Check if installed @sanity/cli satisfies sanity's requirement
    if (cliInfo?.installed) {
      const installedVersion = cliInfo.installed.version
      if (!semver.satisfies(installedVersion, expectedCliRange)) {
        issues.push({
          message: `Installed @sanity/cli@${installedVersion} does not satisfy sanity's requirement of ${expectedCliRange}.`,
          packageName: '@sanity/cli',
          severity: 'error',
          suggestion: `Run: ${pm} install`,
          type: 'cli-version-incompatible',
        })
      }
    }

    // Check global @sanity/cli compatibility with local sanity
    const compatRange = toCaretRange(expectedCliRange)

    for (const global of globals) {
      if (global.packageName !== '@sanity/cli') continue

      if (!semver.satisfies(global.version, compatRange)) {
        issues.push({
          message: `Global @sanity/cli@${global.version} (installed via ${global.packageManager}) is incompatible with local sanity@${sanityInfo.installed.version} (requires @sanity/cli ${compatRange}).`,
          packageName: '@sanity/cli',
          severity: 'warning',
          suggestion: `Run: ${getGlobalUninstallCommand(global.packageManager, '@sanity/cli')}`,
          type: 'global-cli-incompatible',
        })
      }
    }
  }

  return issues
}

/**
 * Check if two semver ranges have any potential overlap.
 * This is a simplified check - it doesn't guarantee perfect accuracy
 * but catches obvious conflicts like "^4.0.0" vs "^5.0.0".
 */
function rangesOverlap(range1: string, range2: string): boolean {
  // Try to find a version that satisfies both ranges
  // Start with common versions and work from there
  const testVersions = [
    // Extract major versions and test around them
    ...extractMajorVersions(range1),
    ...extractMajorVersions(range2),
  ]

  for (const major of testVersions) {
    // Test a few versions in this major
    for (const minor of [0, 50, 99]) {
      for (const patch of [0, 1]) {
        const version = `${major}.${minor}.${patch}`
        if (
          semver.valid(version) &&
          semver.satisfies(version, range1) &&
          semver.satisfies(version, range2)
        ) {
          return true
        }
      }
    }
  }

  return false
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

function extractMajorVersions(range: string): number[] {
  const majors: number[] = []
  // Match common patterns like ^5.0.0, ~4.1.0, >=3.0.0, 2.0.0
  const matches = range.matchAll(/(\d+)\.\d+\.\d+/g)
  for (const match of matches) {
    const major = Number.parseInt(match[1], 10)
    if (!Number.isNaN(major)) {
      majors.push(major)
    }
  }
  return [...new Set(majors)]
}
