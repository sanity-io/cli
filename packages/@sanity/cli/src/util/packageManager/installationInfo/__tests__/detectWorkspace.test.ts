import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {detectWorkspace} from '../detectWorkspace.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '__fixtures__')

describe('detectWorkspace', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('standalone projects', () => {
    test('detects standalone npm project', async () => {
      const cwd = path.join(fixturesDir, 'standalone-npm')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('standalone')
      expect(result.root).toBe(cwd)
      expect(result.nearestPackageJson).toBe(path.join(cwd, 'package.json'))
      expect(result.lockfile).toEqual({
        path: path.join(cwd, 'package-lock.json'),
        type: 'npm',
      })
      expect(result.hasMultipleLockfiles).toBe(false)
    })

    test('detects standalone pnpm project', async () => {
      const cwd = path.join(fixturesDir, 'standalone-pnpm')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('standalone')
      expect(result.root).toBe(cwd)
      expect(result.lockfile).toEqual({
        path: path.join(cwd, 'pnpm-lock.yaml'),
        type: 'pnpm',
      })
      expect(result.hasMultipleLockfiles).toBe(false)
    })
  })

  describe('workspaces', () => {
    test('detects pnpm workspace from nested package', async () => {
      const cwd = path.join(fixturesDir, 'pnpm-workspace-with-catalog', 'packages', 'studio')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('pnpm-workspaces')
      expect(result.root).toBe(path.join(fixturesDir, 'pnpm-workspace-with-catalog'))
      expect(result.nearestPackageJson).toBe(path.join(cwd, 'package.json'))
      expect(result.lockfile).toEqual({
        path: path.join(fixturesDir, 'pnpm-workspace-with-catalog', 'pnpm-lock.yaml'),
        type: 'pnpm',
      })
    })

    test('detects npm workspaces from nested package', async () => {
      const cwd = path.join(fixturesDir, 'npm-workspaces', 'packages', 'studio')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('npm-workspaces')
      expect(result.root).toBe(path.join(fixturesDir, 'npm-workspaces'))
      expect(result.nearestPackageJson).toBe(path.join(cwd, 'package.json'))
      expect(result.lockfile).toEqual({
        path: path.join(fixturesDir, 'npm-workspaces', 'package-lock.json'),
        type: 'npm',
      })
    })

    test('detects yarn workspaces from nested package (with yarn.lock)', async () => {
      const cwd = path.join(fixturesDir, 'yarn-workspaces', 'packages', 'studio')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('yarn-workspaces')
      expect(result.root).toBe(path.join(fixturesDir, 'yarn-workspaces'))
      expect(result.nearestPackageJson).toBe(path.join(cwd, 'package.json'))
      expect(result.lockfile).toEqual({
        path: path.join(fixturesDir, 'yarn-workspaces', 'yarn.lock'),
        type: 'yarn',
      })
    })

    test('detects yarn workspaces via .yarnrc.yml when no lockfile exists', async () => {
      const cwd = path.join(fixturesDir, 'yarn-workspaces-no-lockfile', 'packages', 'studio')
      const result = await detectWorkspace(cwd)

      expect(result.type).toBe('yarn-workspaces')
      expect(result.root).toBe(path.join(fixturesDir, 'yarn-workspaces-no-lockfile'))
      expect(result.nearestPackageJson).toBe(path.join(cwd, 'package.json'))
      expect(result.lockfile).toBeNull()
    })
  })

  describe('no workspace fallback', () => {
    test('returns startDir as root when no lockfile or workspace config is found', async () => {
      // We need a directory where walking up never finds a lockfile or workspace config.
      // Create a temp directory to isolate from the test fixtures.
      const os = await import('node:os')
      const fs = await import('node:fs/promises')
      const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'detect-ws-'))
      const pkgPath = path.join(isolatedDir, 'package.json')
      await fs.writeFile(pkgPath, JSON.stringify({name: 'isolated', version: '1.0.0'}))

      try {
        const result = await detectWorkspace(isolatedDir)

        expect(result.type).toBe('standalone')
        expect(result.root).toBe(isolatedDir)
        expect(result.lockfile).toBeNull()
      } finally {
        await fs.rm(isolatedDir, {recursive: true})
      }
    })
  })

  describe('multiple lockfiles', () => {
    test('detects multiple lockfiles and flags the issue', async () => {
      const cwd = path.join(fixturesDir, 'multiple-lockfiles')
      const result = await detectWorkspace(cwd)

      expect(result.hasMultipleLockfiles).toBe(true)
      // Should use the first lockfile found (npm takes precedence or alphabetical)
      expect(result.lockfile).not.toBeNull()
    })

    test('does not flag multiple lockfiles when both are bun variants', async () => {
      const cwd = path.join(fixturesDir, 'bun-dual-lockfiles')
      const result = await detectWorkspace(cwd)

      // bun.lock + bun.lockb both map to 'bun' — not a true multi-lockfile situation
      expect(result.hasMultipleLockfiles).toBe(false)
      expect(result.lockfile?.type).toBe('bun')
    })
  })
})
