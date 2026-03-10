import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveVersionRange} from '../resolveVersionRange.js'
import {type WorkspaceInfo} from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '__fixtures__')

describe('resolveVersionRange', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('plain version ranges', () => {
    test('returns plain semver range unchanged', async () => {
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: null,
        nearestPackageJson: '/some/path/package.json',
        root: '/some/path',
        type: 'standalone',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('^3.67.0', 'sanity', workspaceInfo)
      expect(result).toBe('^3.67.0')
    })

    test('returns workspace:* unchanged (handled elsewhere)', async () => {
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: null,
        nearestPackageJson: '/some/path/package.json',
        root: '/some/path',
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('workspace:*', 'sanity', workspaceInfo)
      expect(result).toBe('workspace:*')
    })
  })

  describe('pnpm catalog resolution', () => {
    test('resolves catalog: to version from default catalog', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'packages', 'studio', 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:', 'sanity', workspaceInfo)
      expect(result).toBe('^3.67.0')
    })

    test('resolves catalog: for @sanity/cli', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'packages', 'studio', 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:', '@sanity/cli', workspaceInfo)
      expect(result).toBe('^5.33.0')
    })

    test('resolves catalog:default explicitly', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'packages', 'studio', 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:default', 'sanity', workspaceInfo)
      expect(result).toBe('^3.67.0')
    })

    test('resolves catalog: from catalogs.default when top-level catalog is absent', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalogs-default')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:', 'sanity', workspaceInfo)
      expect(result).toBe('^3.68.0')
    })

    test('resolves catalog:default from catalogs.default when top-level catalog is absent', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalogs-default')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:default', 'sanity', workspaceInfo)
      expect(result).toBe('^3.68.0')
    })

    test('returns original value if package not found in catalog', async () => {
      const workspaceRoot = path.join(fixturesDir, 'pnpm-workspace-with-catalog')
      const workspaceInfo: WorkspaceInfo = {
        bunfig: false,
        hasMultipleLockfiles: false,
        lockfile: {
          path: path.join(workspaceRoot, 'pnpm-lock.yaml'),
          type: 'pnpm',
        },
        nearestPackageJson: path.join(workspaceRoot, 'packages', 'studio', 'package.json'),
        root: workspaceRoot,
        type: 'pnpm-workspaces',
        yarnBerry: false,
      }

      const result = await resolveVersionRange('catalog:', 'unknown-package', workspaceInfo)
      expect(result).toBe('catalog:')
    })
  })
})
