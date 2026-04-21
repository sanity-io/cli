import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {preferredPm} from '../preferredPm'

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

    it('prioritizes package-lock.json over yarn.lock', () => {
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
      expect(preferredPm(tmpDir)).toBe('npm')
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
