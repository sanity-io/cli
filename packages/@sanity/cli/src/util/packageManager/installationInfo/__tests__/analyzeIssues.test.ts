import {afterEach, describe, expect, test, vi} from 'vitest'

import {analyzeIssues} from '../analyzeIssues.js'
import {type GlobalInstallation, type PackageInfo, type WorkspaceInfo} from '../types.js'

describe('analyzeIssues', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const defaultWorkspace: WorkspaceInfo = {
    hasMultipleLockfiles: false,
    lockfile: {path: '/project/package-lock.json', type: 'npm'},
    nearestPackageJson: '/project/package.json',
    root: '/project',
    type: 'standalone',
  }

  test('detects declared-not-installed issue', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: null, // Not installed!
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      packageName: 'sanity',
      severity: 'error',
      type: 'declared-not-installed',
    })
    expect(issues[0].suggestion).toContain('npm install')
  })

  test('detects cli-version-incompatible issue', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: null,
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '4.0.0', // But we have 4.0.0 installed
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0', // sanity expects @sanity/cli ^5.33.0
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues.some((i) => i.type === 'cli-version-incompatible')).toBe(true)
    const issue = issues.find((i) => i.type === 'cli-version-incompatible')
    expect(issue?.severity).toBe('error')
  })

  test('detects conflicting-cli-dependency when declared version is incompatible', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: '^4.0.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^4.0.0', // Explicitly declared incompatible version
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '4.0.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(true)
    const issue = issues.find((i) => i.type === 'conflicting-cli-dependency')
    expect(issue?.severity).toBe('error')
  })

  test('detects redundant-cli-dependency when versions are compatible', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: '^5.33.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^5.33.0', // Same as what sanity expects - redundant
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues.some((i) => i.type === 'redundant-cli-dependency')).toBe(true)
    const issue = issues.find((i) => i.type === 'redundant-cli-dependency')
    expect(issue?.severity).toBe('info')
  })

  test('classifies too-wide declared range as conflicting, not redundant', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: '^5.0.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^5.0.0', // Intersects ^5.33.0 but is not a subset
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.10.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues.some((i) => i.type === 'redundant-cli-dependency')).toBe(false)
    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(true)
  })

  test('detects multiple-lockfiles issue', () => {
    const workspaceWithMultipleLockfiles: WorkspaceInfo = {
      ...defaultWorkspace,
      hasMultipleLockfiles: true,
    }

    const issues = analyzeIssues({}, workspaceWithMultipleLockfiles, [])

    expect(issues.some((i) => i.type === 'multiple-lockfiles')).toBe(true)
    const issue = issues.find((i) => i.type === 'multiple-lockfiles')
    expect(issue?.severity).toBe('warning')
  })

  test('detects global-local-mismatch on major version difference', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^4.0.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^4.0.0',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/sanity',
          version: '4.0.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: 'sanity',
        path: '/usr/local/lib/node_modules/sanity',
        version: '3.67.0', // Different major version globally
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    expect(issues.some((i) => i.type === 'global-local-mismatch')).toBe(true)
    const issue = issues.find((i) => i.type === 'global-local-mismatch')
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('npm')
    expect(issue?.suggestion).toContain('npm uninstall -g')
  })

  test('detects mismatch from multiple global installations', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^4.0.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^4.0.0',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/sanity',
          version: '4.0.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: 'sanity',
        path: '/usr/local/lib/node_modules/sanity',
        version: '3.67.0',
      },
      {
        isActive: false,
        packageManager: 'pnpm',
        packageName: 'sanity',
        path: '~/.local/share/pnpm/global/node_modules/sanity',
        version: '2.0.0',
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)
    const mismatches = issues.filter((i) => i.type === 'global-local-mismatch')
    expect(mismatches).toHaveLength(2)
    expect(mismatches[0].suggestion).toContain('npm uninstall -g')
    expect(mismatches[1].suggestion).toContain('pnpm remove -g')
  })

  test('does not flag global-local-mismatch for minor/patch differences', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: 'sanity',
        path: '/usr/local/lib/node_modules/sanity',
        version: '3.50.0', // Same major, different minor
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    expect(issues.some((i) => i.type === 'global-local-mismatch')).toBe(false)
  })

  test('does not crash on invalid version strings in global-local-mismatch check', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: 'latest',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: 'latest',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/sanity',
          version: 'latest', // Not valid semver
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: 'sanity',
        path: '/usr/local/lib/node_modules/sanity',
        version: '3.x', // Not valid semver
      },
    ]

    // Should not throw
    const issues = analyzeIssues(packages, defaultWorkspace, globals)
    expect(issues.some((i) => i.type === 'global-local-mismatch')).toBe(false)
  })

  test('detects override-in-effect issue', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: null,
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.30.0',
        },
        override: {
          mechanism: 'npm-overrides',
          packageJsonPath: '/project/package.json',
          versionRange: '^5.30.0',
        },
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    expect(issues.some((i) => i.type === 'override-in-effect')).toBe(true)
    const issue = issues.find((i) => i.type === 'override-in-effect')
    expect(issue?.severity).toBe('info')
  })

  test('detects global-cli-incompatible when global @sanity/cli is too old for local sanity', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '5.33.0', // Pinned — should be treated as ^5.33.0
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: false,
        packageManager: 'npm',
        packageName: '@sanity/cli',
        path: '/usr/local/lib/node_modules/@sanity/cli',
        version: '5.0.0', // Too old — doesn't satisfy ^5.33.0
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    expect(issues.some((i) => i.type === 'global-cli-incompatible')).toBe(true)
    const issue = issues.find((i) => i.type === 'global-cli-incompatible')
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('5.0.0')
    expect(issue?.message).toContain('npm')
    expect(issue?.suggestion).toContain('npm uninstall -g')
  })

  test('does not flag global-cli-incompatible when global version satisfies range', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '5.33.0', // Pinned — treated as ^5.33.0
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: false,
        packageManager: 'npm',
        packageName: '@sanity/cli',
        path: '/usr/local/lib/node_modules/@sanity/cli',
        version: '5.40.0', // Satisfies ^5.33.0
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    expect(issues.some((i) => i.type === 'global-cli-incompatible')).toBe(false)
  })

  test('treats pinned cliDependencyRange as caret range for compatibility check', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '5.33.2', // Exact pinned version
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    // 5.33.1 is BELOW 5.33.2 so should NOT satisfy ^5.33.2
    const globals: GlobalInstallation[] = [
      {
        isActive: false,
        packageManager: 'pnpm',
        packageName: '@sanity/cli',
        path: '~/.local/share/pnpm/global/node_modules/@sanity/cli',
        version: '5.33.1',
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)
    expect(issues.some((i) => i.type === 'global-cli-incompatible')).toBe(true)
  })

  test('declared-not-installed suggestion includes specific install command', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: null,
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    const issue = issues.find((i) => i.type === 'declared-not-installed')
    expect(issue?.suggestion).toBe('Run: npm install')
  })

  test('redundant-cli-dependency suggestion includes remove command', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: '^5.33.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^5.33.0',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    const issue = issues.find((i) => i.type === 'redundant-cli-dependency')
    expect(issue?.suggestion).toContain('npm uninstall @sanity/cli')
  })

  test('conflicting-cli-dependency suggestion includes remove command', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: '^4.0.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^4.0.0',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '4.0.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    const issue = issues.find((i) => i.type === 'conflicting-cli-dependency')
    expect(issue?.suggestion).toContain('npm uninstall @sanity/cli')
  })

  test('skips conflict check for workspace:* protocol (local package reference)', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: 'workspace:*',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: 'workspace:*',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])
    // workspace:* is a local package reference — should not flag as conflicting
    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(false)
    expect(issues.some((i) => i.type === 'redundant-cli-dependency')).toBe(false)
  })

  test('skips conflict check for git+https: protocol', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: 'git+https://github.com/sanity-io/cli.git',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: 'git+https://github.com/sanity-io/cli.git',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])
    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(false)
    expect(issues.some((i) => i.type === 'redundant-cli-dependency')).toBe(false)
  })

  test('skips conflict check for github: protocol', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: 'github:sanity-io/cli',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: 'github:sanity-io/cli',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])
    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(false)
    expect(issues.some((i) => i.type === 'redundant-cli-dependency')).toBe(false)
  })

  test('skips conflict check for file: protocol', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: {
          declaredVersionRange: 'file:../cli',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: 'file:../cli',
        },
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])
    expect(issues.some((i) => i.type === 'conflicting-cli-dependency')).toBe(false)
  })

  test('returns no issues when everything is properly configured', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: null,
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    // Should only have @sanity/cli installed via sanity
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  test('does not double-report global @sanity/cli as both global-local-mismatch and global-cli-incompatible', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: null,
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: '@sanity/cli',
        path: '/usr/local/lib/node_modules/@sanity/cli',
        version: '4.0.0', // Different major — would trigger both checks without the guard
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    // Should only get global-cli-incompatible, NOT global-local-mismatch
    expect(issues.filter((i) => i.type === 'global-cli-incompatible')).toHaveLength(1)
    expect(issues.filter((i) => i.type === 'global-local-mismatch')).toHaveLength(0)
  })

  test('excludes @sanity/cli from global-local-mismatch check entirely', () => {
    // @sanity/cli should never produce global-local-mismatch — only global-cli-incompatible.
    // This test ensures the `name !== '@sanity/cli'` guard in the mismatch check works.
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      '@sanity/cli': {
        declared: null,
        installed: {
          cliDependencyRange: null,
          path: '/project/node_modules/@sanity/cli',
          version: '5.33.0',
        },
        override: null,
      },
    }

    const globals: GlobalInstallation[] = [
      {
        isActive: true,
        packageManager: 'npm',
        packageName: '@sanity/cli',
        path: null,
        version: '4.0.0', // Different major version
      },
    ]

    const issues = analyzeIssues(packages, defaultWorkspace, globals)

    // Without sanity installed, global-cli-incompatible won't fire either,
    // so no issues at all — the key assertion is no global-local-mismatch.
    expect(issues.filter((i) => i.type === 'global-local-mismatch')).toHaveLength(0)
  })

  test('reports error when @sanity/cli is not installed but required by sanity', () => {
    const packages: Partial<Record<'@sanity/cli' | 'sanity', PackageInfo>> = {
      sanity: {
        declared: {
          declaredVersionRange: '^3.67.0',
          dependencyType: 'dependencies',
          packageJsonPath: '/project/package.json',
          versionRange: '^3.67.0',
        },
        installed: {
          cliDependencyRange: '^5.33.0',
          path: '/project/node_modules/sanity',
          version: '3.67.0',
        },
        override: null,
      },
    }

    const issues = analyzeIssues(packages, defaultWorkspace, [])

    const cliNotInstalled = issues.find((i) => i.type === 'cli-not-installed')
    expect(cliNotInstalled).toBeDefined()
    expect(cliNotInstalled?.severity).toBe('error')
    expect(cliNotInstalled?.message).toBe(
      '@sanity/cli is not installed. It is required by sanity@3.67.0.',
    )
    expect(cliNotInstalled?.suggestion).toBe('Run: npm install')
  })
})
