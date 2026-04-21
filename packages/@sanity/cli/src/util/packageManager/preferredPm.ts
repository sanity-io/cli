// Based on preferred-pm (MIT) by Zoltan Kochan — https://github.com/zkochan/packages
// Based on which-pm (MIT) by pnpm — https://github.com/pnpm/which-pm

import fs from 'node:fs'
import path from 'node:path'

import picomatch from 'picomatch'

import {toForwardSlashes} from '../toForwardSlashes.js'
import {type PackageManager} from './packageManagerChoice.js'

type DetectablePackageManager = Exclude<PackageManager, 'manual'>

/**
 * Detects the preferred package manager for a project by examining lock files,
 * workspace configurations, and node_modules markers.
 */
export function preferredPm(pkgPath: string): DetectablePackageManager | null {
  const fromLockFile = detectFromLockFile(pkgPath)
  if (fromLockFile) return fromLockFile

  const fromParentPnpm = findUp('pnpm-lock.yaml', pkgPath) || findUp('pnpm-workspace.yaml', pkgPath)
  if (fromParentPnpm) return 'pnpm'

  const fromWorkspace = detectFromWorkspaceRoot(pkgPath)
  if (fromWorkspace) return fromWorkspace

  return detectFromNodeModules(pkgPath)
}

function detectFromLockFile(dir: string): DetectablePackageManager | null {
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm'
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(dir, 'shrinkwrap.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock')))
    return 'bun'
  return null
}

function findUp(filename: string, startDir: string): string | undefined {
  let dir = path.resolve(startDir)
  const {root} = path.parse(dir)

  while (dir) {
    const filePath = path.join(dir, filename)
    if (fs.existsSync(filePath)) return filePath
    if (dir === root) break
    dir = path.dirname(dir)
  }

  return undefined
}

function findNearestPackageDir(startDir: string): string {
  let dir = path.resolve(startDir)
  const {root} = path.parse(dir)

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }

  return startDir
}

function detectFromWorkspaceRoot(pkgPath: string): DetectablePackageManager | null {
  const resolvedPkgPath = path.resolve(pkgPath)
  const packageDir = findNearestPackageDir(resolvedPkgPath)
  let dir = resolvedPkgPath
  const {root} = path.parse(dir)

  while (true) {
    const manifestPath = path.join(dir, 'package.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const workspaces = extractWorkspaces(manifest)

        if (workspaces) {
          const matchDir = packageDir === dir ? resolvedPkgPath : packageDir
          const relativePath = toForwardSlashes(path.relative(dir, matchDir))
          if (relativePath === '' || picomatch.isMatch(relativePath, workspaces)) {
            return detectFromLockFile(dir) ?? 'yarn'
          }
          continue
        }
      } catch {
        // malformed package.json, skip
      }
    }
    if (dir === root) break
    dir = path.dirname(dir)
  }

  return null
}

function extractWorkspaces(manifest: Record<string, unknown>): string[] | null {
  const workspaces = manifest?.workspaces
  if (Array.isArray(workspaces)) return workspaces
  if (
    workspaces &&
    typeof workspaces === 'object' &&
    'packages' in workspaces &&
    Array.isArray((workspaces as Record<string, unknown>).packages)
  ) {
    return (workspaces as Record<string, unknown>).packages as string[]
  }
  return null
}

function detectFromNodeModules(pkgPath: string): DetectablePackageManager | null {
  const modulesPath = path.join(pkgPath, 'node_modules')

  if (fs.existsSync(path.join(modulesPath, '.yarn-integrity'))) return 'yarn'

  try {
    const modulesYaml = fs.readFileSync(path.join(modulesPath, '.modules.yaml'), 'utf8')
    const pmLine = modulesYaml
      .split('\n')
      .find((line) => /^\s*"?packageManager"?\s*[:=]/.test(line))
    if (pmLine) {
      const valueMatch = pmLine.match(/[:=]\s*['"]?([^'",\s]+)/)
      if (valueMatch) {
        const pmSpec = valueMatch[1]
        const name = pmSpec.startsWith('@')
          ? `@${pmSpec.slice(1).split('@')[0]}`
          : pmSpec.split('@')[0]
        if (name === 'pnpm') return 'pnpm'
        if (name === 'yarn') return 'yarn'
        if (name === 'npm') return 'npm'
        if (name === 'bun') return 'bun'
      }
    }
  } catch {
    // best-effort detection — swallow all read errors
  }

  if (fs.existsSync(modulesPath)) return 'npm'

  return null
}
