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
  })

  describe('multiple lockfiles', () => {
    test('detects multiple lockfiles and flags the issue', async () => {
      const cwd = path.join(fixturesDir, 'multiple-lockfiles')
      const result = await detectWorkspace(cwd)

      expect(result.hasMultipleLockfiles).toBe(true)
      // Should use the first lockfile found (npm takes precedence or alphabetical)
      expect(result.lockfile).not.toBeNull()
    })
  })
})
