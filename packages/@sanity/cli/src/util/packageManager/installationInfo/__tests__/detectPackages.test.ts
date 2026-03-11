import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {
  findInstalledPackage,
  findPackageDeclaration,
  findPackageOverride,
} from '../detectPackages.js'
import {type WorkspaceInfo} from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '__fixtures__')

describe('findPackageDeclaration', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('finds sanity declaration in standalone project', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(cwd, 'package-lock.json'), type: 'npm'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageDeclaration('sanity', cwd, workspaceInfo)

    expect(result).not.toBeNull()
    expect(result?.packageJsonPath).toBe(path.join(cwd, 'package.json'))
    expect(result?.versionRange).toBe('^3.67.0')
    expect(result?.declaredVersionRange).toBe('^3.67.0')
    expect(result?.dependencyType).toBe('dependencies')
  })

  test('does not treat peerDependencies as a declaration', async () => {
    const cwd = path.join(fixturesDir, 'peer-dep-only')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: null,
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageDeclaration('sanity', cwd, workspaceInfo)

    // sanity is only in peerDependencies — should not be treated as declared
    expect(result).toBeNull()
  })

  test('returns null when package is not declared', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(cwd, 'package-lock.json'), type: 'npm'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageDeclaration('@sanity/cli', cwd, workspaceInfo)

    expect(result).toBeNull()
  })

  test('resolves catalog: version in pnpm workspace', async () => {
    const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
    const cwd = path.join(workspaceRoot, 'packages', 'studio')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(workspaceRoot, 'pnpm-lock.yaml'), type: 'pnpm'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: workspaceRoot,
      type: 'pnpm-workspaces',
      yarnBerry: false,
    }

    const result = await findPackageDeclaration('sanity', cwd, workspaceInfo)

    expect(result).not.toBeNull()
    expect(result?.packageJsonPath).toBe(path.join(cwd, 'package.json'))
    expect(result?.declaredVersionRange).toBe('catalog:')
    expect(result?.versionRange).toBe('^3.67.0') // resolved from catalog
    expect(result?.dependencyType).toBe('dependencies')
  })
})

describe('findPackageOverride', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('finds npm override', async () => {
    const cwd = path.join(fixturesDir, 'with-npm-overrides')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(cwd, 'package-lock.json'), type: 'npm'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageOverride('@sanity/cli', workspaceInfo)

    expect(result).not.toBeNull()
    expect(result?.packageJsonPath).toBe(path.join(cwd, 'package.json'))
    expect(result?.mechanism).toBe('npm-overrides')
    expect(result?.versionRange).toBe('^5.30.0')
  })

  test('finds yarn resolution', async () => {
    const cwd = path.join(fixturesDir, 'with-yarn-resolutions')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(cwd, 'yarn.lock'), type: 'yarn'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageOverride('@sanity/cli', workspaceInfo)

    expect(result).not.toBeNull()
    expect(result?.packageJsonPath).toBe(path.join(cwd, 'package.json'))
    expect(result?.mechanism).toBe('yarn-resolutions')
    expect(result?.versionRange).toBe('^5.30.0')
  })

  test('returns null when no override exists', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')
    const workspaceInfo: WorkspaceInfo = {
      bunfig: false,
      hasMultipleLockfiles: false,
      lockfile: {path: path.join(cwd, 'package-lock.json'), type: 'npm'},
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
      yarnBerry: false,
    }

    const result = await findPackageOverride('@sanity/cli', workspaceInfo)

    expect(result).toBeNull()
  })
})

describe('findInstalledPackage', () => {
  // pnpm uses symlinks: node_modules/sanity -> .pnpm/sanity@5.4.0/node_modules/sanity
  // Git cannot store symlinks reliably, so we create them for the test.
  const pnpmFixture = path.join(fixturesDir, 'pnpm-nested-deps')
  const sanityLink = path.join(pnpmFixture, 'node_modules', 'sanity')
  const sanityTarget = path.join(
    pnpmFixture,
    'node_modules',
    '.pnpm',
    'sanity@5.4.0',
    'node_modules',
    'sanity',
  )

  beforeAll(() => {
    // Ensure node_modules dir exists
    fs.mkdirSync(path.join(pnpmFixture, 'node_modules'), {recursive: true})
    // Remove existing flat dir or stale symlink
    fs.rmSync(sanityLink, {force: true, recursive: true})
    // Create pnpm-style symlink
    fs.symlinkSync(sanityTarget, sanityLink, 'junction')
  })

  afterAll(() => {
    fs.rmSync(sanityLink, {force: true, recursive: true})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('finds sanity in pnpm nested structure', async () => {
    const cwd = pnpmFixture

    const result = await findInstalledPackage('sanity', cwd, cwd)

    expect(result).not.toBeNull()
    expect(result?.version).toBe('5.4.0')
    expect(result?.cliDependencyRange).toBe('5.4.0')
  })

  test('finds @sanity/cli nested inside sanity node_modules (pnpm)', async () => {
    const cwd = pnpmFixture

    const result = await findInstalledPackage('@sanity/cli', cwd, cwd)

    expect(result).not.toBeNull()
    expect(result?.version).toBe('5.4.0')
    // In pnpm, @sanity/cli is a sibling to sanity in the .pnpm/.../node_modules folder
    const expectedSuffix = path.join('.pnpm', 'sanity@5.4.0', 'node_modules', '@sanity', 'cli')
    expect(result?.path).toContain(expectedSuffix)
  })

  test('returns null when @sanity/cli is not found within workspace root', async () => {
    const cwd = path.join(fixturesDir, 'standalone-npm')

    // standalone-npm has no node_modules. With the workspace root set to cwd,
    // the search stops there instead of walking up to the monorepo.
    const result = await findInstalledPackage('@sanity/cli', cwd, cwd)

    expect(result).toBeNull()
  })
})
