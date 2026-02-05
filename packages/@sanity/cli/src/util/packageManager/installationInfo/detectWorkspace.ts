import fs from 'node:fs/promises'
import path from 'node:path'

import {type PackageManager, type WorkspaceInfo, type WorkspaceType} from './types.js'

interface LockfileInfo {
  path: string
  type: PackageManager
}

const LOCKFILE_MAP: Record<string, PackageManager> = {
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
}

const LOCKFILE_NAMES = Object.keys(LOCKFILE_MAP)

/**
 * Detects workspace configuration by walking up from the given directory.
 * Identifies workspace type, root, lockfile, and whether multiple lockfiles exist.
 *
 * The search stops when a lockfile is found, as this indicates a project root.
 * This prevents accidentally detecting parent monorepo configurations when
 * analyzing a standalone project.
 */
export async function detectWorkspace(cwd: string): Promise<WorkspaceInfo> {
  const nearestPackageJson = await findNearestPackageJson(cwd)
  if (!nearestPackageJson) {
    // No package.json found - return minimal info
    return {
      hasMultipleLockfiles: false,
      lockfile: null,
      nearestPackageJson: path.join(cwd, 'package.json'),
      root: cwd,
      type: 'standalone',
    }
  }

  // Find workspace root and type by walking up
  // This also finds lockfiles along the way
  const {lockfiles, root, type} = await findWorkspaceRoot(path.dirname(nearestPackageJson))

  const hasMultipleLockfiles = lockfiles.length > 1

  // Use the first lockfile found (npm > yarn > pnpm > bun by object key order)
  const lockfile = lockfiles.length > 0 ? lockfiles[0] : null

  return {
    hasMultipleLockfiles,
    lockfile,
    nearestPackageJson,
    root,
    type,
  }
}

async function findNearestPackageJson(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir)
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (await fileExists(packageJsonPath)) {
      return packageJsonPath
    }
    currentDir = path.dirname(currentDir)
  }

  return null
}

async function findWorkspaceRoot(
  startDir: string,
): Promise<{lockfiles: LockfileInfo[]; root: string; type: WorkspaceType}> {
  let currentDir = path.resolve(startDir)
  const fsRoot = path.parse(currentDir).root

  while (currentDir !== fsRoot) {
    // Check for lockfiles at this level - if found, this is the project root
    const lockfiles = await findLockfiles(currentDir)

    if (lockfiles.length > 0) {
      // Found lockfile(s), this is the project root
      // Now determine workspace type

      // Check for pnpm-workspace.yaml (definitive pnpm workspace marker)
      const pnpmWorkspacePath = path.join(currentDir, 'pnpm-workspace.yaml')
      if (await fileExists(pnpmWorkspacePath)) {
        return {lockfiles, root: currentDir, type: 'pnpm-workspaces'}
      }

      // Check for package.json with workspaces field
      const packageJsonPath = path.join(currentDir, 'package.json')
      if (await fileExists(packageJsonPath)) {
        const packageJson = await readJsonFile(packageJsonPath)
        if (packageJson?.workspaces) {
          // Determine workspace type based on lockfile
          if (lockfiles.some((l) => l.type === 'yarn')) {
            return {lockfiles, root: currentDir, type: 'yarn-workspaces'}
          }
          if (lockfiles.some((l) => l.type === 'npm')) {
            return {lockfiles, root: currentDir, type: 'npm-workspaces'}
          }
          if (lockfiles.some((l) => l.type === 'pnpm')) {
            return {lockfiles, root: currentDir, type: 'pnpm-workspaces'}
          }
          // Default to npm if no recognized lockfile
          return {lockfiles, root: currentDir, type: 'npm-workspaces'}
        }
      }

      // Has lockfile but no workspace config - standalone project
      return {lockfiles, root: currentDir, type: 'standalone'}
    }

    // No lockfile at this level, check for workspace markers before going up
    // This handles the case where we're in a nested package that doesn't have its own lockfile

    // Check for pnpm-workspace.yaml
    const pnpmWorkspacePath = path.join(currentDir, 'pnpm-workspace.yaml')
    if (await fileExists(pnpmWorkspacePath)) {
      // This is a pnpm workspace root, find its lockfile
      const rootLockfiles = await findLockfiles(currentDir)
      return {lockfiles: rootLockfiles, root: currentDir, type: 'pnpm-workspaces'}
    }

    // Check for package.json with workspaces field
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (await fileExists(packageJsonPath)) {
      const packageJson = await readJsonFile(packageJsonPath)
      if (packageJson?.workspaces) {
        // This is a workspace root, find its lockfile
        const rootLockfiles = await findLockfiles(currentDir)
        if (rootLockfiles.some((l) => l.type === 'yarn')) {
          return {lockfiles: rootLockfiles, root: currentDir, type: 'yarn-workspaces'}
        }
        if (rootLockfiles.some((l) => l.type === 'npm')) {
          return {lockfiles: rootLockfiles, root: currentDir, type: 'npm-workspaces'}
        }
        if (rootLockfiles.some((l) => l.type === 'pnpm')) {
          return {lockfiles: rootLockfiles, root: currentDir, type: 'pnpm-workspaces'}
        }
        return {lockfiles: rootLockfiles, root: currentDir, type: 'npm-workspaces'}
      }
    }

    currentDir = path.dirname(currentDir)
  }

  // No workspace or lockfile found, use the starting directory as root
  return {lockfiles: [], root: startDir, type: 'standalone'}
}

async function findLockfiles(dir: string): Promise<LockfileInfo[]> {
  const lockfiles: LockfileInfo[] = []

  for (const lockfileName of LOCKFILE_NAMES) {
    const lockfilePath = path.join(dir, lockfileName)
    if (await fileExists(lockfilePath)) {
      lockfiles.push({
        path: lockfilePath,
        type: LOCKFILE_MAP[lockfileName],
      })
    }
  }

  return lockfiles
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}
