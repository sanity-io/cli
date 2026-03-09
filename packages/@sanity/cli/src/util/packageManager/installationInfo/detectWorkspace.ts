import fs from 'node:fs/promises'
import path from 'node:path'

import {readJsonFile} from './readJsonFile.js'
import {type LockfileType, type WorkspaceInfo, type WorkspaceType} from './types.js'

interface LockfileInfo {
  path: string
  type: LockfileType
}

const LOCKFILE_MAP: Record<string, LockfileType> = {
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
  'package-lock.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
}

// Explicit detection order: determines which lockfile is preferred when multiple exist.
// pnpm > npm > yarn > bun — pnpm first because it's most common in Sanity projects.
const LOCKFILE_NAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']

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
      nearestPackageJson: null,
      root: cwd,
      type: 'standalone',
    }
  }

  // Find workspace root and type by walking up
  // This also finds lockfiles along the way
  const {lockfiles, root, type} = await findWorkspaceRoot(path.dirname(nearestPackageJson))

  // De-duplicate by package manager type: bun.lock + bun.lockb both map to 'bun'
  // and should not trigger a false "multiple lockfiles" warning.
  const uniquePmTypes = new Set(lockfiles.map((l) => l.type))
  const hasMultipleLockfiles = uniquePmTypes.size > 1

  // Use the first lockfile found (ordered by LOCKFILE_NAMES priority)
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
          return {lockfiles, root: currentDir, type: getWorkspaceType(lockfiles)}
        }
      }

      // Has lockfile but no workspace config - standalone project
      return {lockfiles, root: currentDir, type: 'standalone'}
    }

    // No lockfile at this level, check for workspace markers before going up.
    // This handles the case where we're in a nested package that doesn't have
    // its own lockfile, or a fresh checkout before `install` has been run.
    // We already know lockfiles is [] for this dir, so don't re-query.

    // Check for pnpm-workspace.yaml
    const pnpmWorkspacePath = path.join(currentDir, 'pnpm-workspace.yaml')
    if (await fileExists(pnpmWorkspacePath)) {
      return {lockfiles: [], root: currentDir, type: 'pnpm-workspaces'}
    }

    // Check for package.json with workspaces field
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (await fileExists(packageJsonPath)) {
      const packageJson = await readJsonFile(packageJsonPath)
      if (packageJson?.workspaces) {
        // Without a lockfile we can't determine the workspace type from
        // lockfile presence. Check for .yarnrc.yml to distinguish yarn
        // from npm before falling back to npm-workspaces.
        const yarnrcPath = path.join(currentDir, '.yarnrc.yml')
        if (await fileExists(yarnrcPath)) {
          return {lockfiles: [], root: currentDir, type: 'yarn-workspaces'}
        }
        return {lockfiles: [], root: currentDir, type: 'npm-workspaces'}
      }
    }

    currentDir = path.dirname(currentDir)
  }

  // No workspace or lockfile found, use the starting directory as root
  return {lockfiles: [], root: startDir, type: 'standalone'}
}

/**
 * Determines the workspace type from the lockfiles found at the workspace root.
 * Checks yarn first (since npm workspaces also use package.json#workspaces),
 * then npm, then pnpm, defaulting to npm-workspaces.
 */
function getWorkspaceType(lockfiles: LockfileInfo[]): WorkspaceType {
  if (lockfiles.some((l) => l.type === 'yarn')) return 'yarn-workspaces'
  if (lockfiles.some((l) => l.type === 'npm')) return 'npm-workspaces'
  if (lockfiles.some((l) => l.type === 'pnpm')) return 'pnpm-workspaces'
  if (lockfiles.some((l) => l.type === 'bun')) return 'bun-workspaces'
  return 'npm-workspaces'
}

async function findLockfiles(dir: string): Promise<LockfileInfo[]> {
  const results = await Promise.all(
    LOCKFILE_NAMES.map(async (name) => {
      const lockfilePath = path.join(dir, name)
      return (await fileExists(lockfilePath))
        ? {path: lockfilePath, type: LOCKFILE_MAP[name]}
        : null
    }),
  )
  return results.filter((r): r is LockfileInfo => r !== null)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
