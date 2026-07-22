import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {preferredPm} from '../../../../src/util/packageManager/preferredPm'

describe('preferredPm', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preferred-pm-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, {force: true, recursive: true})
  })

  describe('lock file detection', () => {
    it('returns npm for package-lock.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      expect(preferredPm(tmpDir)).toBe('npm')
    })

    it('returns yarn for yarn.lock', () => {
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('returns pnpm for pnpm-lock.yaml', () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns pnpm for shrinkwrap.yaml', () => {
      fs.writeFileSync(path.join(tmpDir, 'shrinkwrap.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns bun for bun.lockb', () => {
      fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
      expect(preferredPm(tmpDir)).toBe('bun')
    })

    it('returns bun for bun.lock', () => {
      fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '')
      expect(preferredPm(tmpDir)).toBe('bun')
    })

    it('prioritizes yarn.lock over a stray package-lock.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('prioritizes pnpm-lock.yaml over a stray package-lock.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns npm when package-lock.json is the only lock file', () => {
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      expect(preferredPm(tmpDir)).toBe('npm')
    })

    it('returns npm when npm-shrinkwrap.json is the only lock file', () => {
      fs.writeFileSync(path.join(tmpDir, 'npm-shrinkwrap.json'), '{}')
      expect(preferredPm(tmpDir)).toBe('npm')
    })

    it('prioritizes pnpm-lock.yaml over a stray npm-shrinkwrap.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'npm-shrinkwrap.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })
  })

  describe('packageManager field detection', () => {
    it('prioritizes the packageManager field over package-lock.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({packageManager: 'pnpm@9.1.2'}),
      )
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns yarn for a packageManager field with a hash suffix', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          packageManager: 'yarn@4.1.0+sha224.fd21d9eb5fba020083811af1d4953acc21eeb9f6',
        }),
      )
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('returns bun for a bun packageManager field', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({packageManager: 'bun@1.1.0'}),
      )
      expect(preferredPm(tmpDir)).toBe('bun')
    })

    it('ignores a malformed packageManager field and falls back to lock files', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({packageManager: 'not-a-real-pm@1.0.0'}),
      )
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('ignores a packageManager field without a version', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({packageManager: 'pnpm'}))
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('returns the package manager declared in devEngines.packageManager', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({devEngines: {packageManager: {name: 'pnpm'}}}),
      )
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('prioritizes the packageManager field over devEngines when both are present', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          devEngines: {packageManager: {name: 'yarn'}},
          packageManager: 'pnpm@9.1.2',
        }),
      )
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('prioritizes devEngines.packageManager over package-lock.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({devEngines: {packageManager: {name: 'yarn'}}}),
      )
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('uses the first entry when devEngines.packageManager is an array', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({devEngines: {packageManager: [{name: 'bun'}, {name: 'yarn'}]}}),
      )
      expect(preferredPm(tmpDir)).toBe('bun')
    })

    it('ignores malformed devEngines shapes and falls back to lock files', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({devEngines: {packageManager: 'pnpm'}}),
      )
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('ignores unknown devEngines package manager names', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({devEngines: {packageManager: {name: 'not-a-real-pm'}}}),
      )
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('prioritizes the workspace root packageManager field over its lock file', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({packageManager: 'pnpm@9.1.2', workspaces: ['packages/*']}),
      )
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      fs.writeFileSync(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))
      expect(preferredPm(childDir)).toBe('pnpm')
    })
  })

  describe('parent directory pnpm walk-up', () => {
    it('finds pnpm-lock.yaml in a parent directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      expect(preferredPm(childDir)).toBe('pnpm')
    })

    it('finds pnpm-workspace.yaml in a parent directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      expect(preferredPm(childDir)).toBe('pnpm')
    })
  })

  describe('workspace root detection', () => {
    it('returns yarn for yarn workspaces', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      fs.writeFileSync(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))
      expect(preferredPm(childDir)).toBe('yarn')
    })

    it('returns npm for workspace root with package-lock.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      fs.writeFileSync(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))
      expect(preferredPm(childDir)).toBe('npm')
    })

    it('returns null for path not matching workspace globs', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      const outsideDir = path.join(tmpDir, 'other', 'child')
      fs.mkdirSync(outsideDir, {recursive: true})
      expect(preferredPm(outsideDir)).toBeNull()
    })

    it('handles workspaces.packages object format', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: {packages: ['packages/*']}}),
      )
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      fs.writeFileSync(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))
      expect(preferredPm(childDir)).toBe('yarn')
    })

    it('continues to parent workspace when inner workspace does not match', () => {
      // Outer workspace root owns apps/*
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({workspaces: ['apps/*']}))
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')

      // Inner workspace root owns packages/* — does NOT own src/
      const innerDir = path.join(tmpDir, 'apps', 'myapp')
      fs.mkdirSync(innerDir, {recursive: true})
      fs.writeFileSync(
        path.join(innerDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )

      // Target is inside inner workspace root but not matching its globs
      const targetDir = path.join(innerDir, 'src')
      fs.mkdirSync(targetDir, {recursive: true})
      // Should traverse past inner workspace root and find outer one
      expect(preferredPm(targetDir)).toBe('yarn')
    })

    it('skips malformed package.json and continues walk-up', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({workspaces: ['apps/*']}))
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')

      const appDir = path.join(tmpDir, 'apps', 'myapp')
      fs.mkdirSync(appDir, {recursive: true})
      fs.writeFileSync(path.join(appDir, 'package.json'), '{invalid json!!!}')

      expect(preferredPm(appDir)).toBe('yarn')
    })

    it('detects workspace PM from a subdirectory within a package', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      fs.writeFileSync(path.join(childDir, 'package.json'), JSON.stringify({name: 'child'}))
      const deepDir = path.join(childDir, 'src', 'utils')
      fs.mkdirSync(deepDir, {recursive: true})
      expect(preferredPm(deepDir)).toBe('yarn')
    })
  })

  describe('node_modules marker detection', () => {
    it('returns yarn when .yarn-integrity exists', () => {
      const nmDir = path.join(tmpDir, 'node_modules')
      fs.mkdirSync(nmDir, {recursive: true})
      fs.writeFileSync(path.join(nmDir, '.yarn-integrity'), '')
      expect(preferredPm(tmpDir)).toBe('yarn')
    })

    it('returns pnpm when .modules.yaml contains pnpm (YAML format)', () => {
      const nmDir = path.join(tmpDir, 'node_modules')
      fs.mkdirSync(nmDir, {recursive: true})
      fs.writeFileSync(path.join(nmDir, '.modules.yaml'), "packageManager: 'pnpm@9.0.0'\n")
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns pnpm when .modules.yaml uses JSON format with quoted keys', () => {
      const nmDir = path.join(tmpDir, 'node_modules')
      fs.mkdirSync(nmDir, {recursive: true})
      fs.writeFileSync(
        path.join(nmDir, '.modules.yaml'),
        '{\n  "packageManager": "pnpm@10.30.3",\n}\n',
      )
      expect(preferredPm(tmpDir)).toBe('pnpm')
    })

    it('returns npm when node_modules exists with no markers', () => {
      const nmDir = path.join(tmpDir, 'node_modules')
      fs.mkdirSync(nmDir, {recursive: true})
      expect(preferredPm(tmpDir)).toBe('npm')
    })
  })

  describe('workspace root lock file detection', () => {
    it('returns bun for workspace root with bun.lock', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      expect(preferredPm(childDir)).toBe('bun')
    })

    it('returns pnpm for workspace root with pnpm-lock.yaml', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({workspaces: ['packages/*']}),
      )
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
      const childDir = path.join(tmpDir, 'packages', 'child')
      fs.mkdirSync(childDir, {recursive: true})
      expect(preferredPm(childDir)).toBe('pnpm')
    })
  })

  describe('error handling', () => {
    // chmod doesn't enforce read permissions on Windows
    it.skipIf(process.platform === 'win32')(
      'swallows permission errors when reading .modules.yaml',
      () => {
        const nmDir = path.join(tmpDir, 'node_modules')
        fs.mkdirSync(nmDir, {recursive: true})
        const yamlPath = path.join(nmDir, '.modules.yaml')
        fs.writeFileSync(yamlPath, "packageManager: 'pnpm@9.0.0'\n")
        fs.chmodSync(yamlPath, 0o000)
        // Should not throw — falls through to npm detection (node_modules exists)
        expect(preferredPm(tmpDir)).toBe('npm')
        fs.chmodSync(yamlPath, 0o644)
      },
    )
  })

  describe('no detection', () => {
    it('returns null for empty directory', () => {
      expect(preferredPm(tmpDir)).toBeNull()
    })
  })
})
