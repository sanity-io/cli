import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {resolve as resolveImport} from 'import-meta-resolve'

import {resolveVersionRange} from './resolveVersionRange.js'
import {
  type InstalledPackage,
  type PackageDeclaration,
  type PackageInfo,
  type PackageOverride,
  type SanityPackage,
  type WorkspaceInfo,
} from './types.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  name?: string
  overrides?: Record<string, string>
  peerDependencies?: Record<string, string>
  pnpm?: {
    overrides?: Record<string, string>
  }
  resolutions?: Record<string, string>
  version?: string
}

/**
 * Finds where a package is declared in the workspace, walking up from startDir.
 * Resolves catalog: protocol if used.
 */
export async function findPackageDeclaration(
  packageName: SanityPackage,
  startDir: string,
  workspaceInfo: WorkspaceInfo,
): Promise<PackageDeclaration | null> {
  let currentDir = path.resolve(startDir)
  const fsRoot = path.parse(currentDir).root

  // Walk up until we pass the workspace root
  while (currentDir !== fsRoot) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    const packageJson = await readJsonFile<PackageJson>(packageJsonPath)

    if (packageJson) {
      // Check dependencies, devDependencies, peerDependencies in order
      const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'] as const
      for (const depType of depTypes) {
        const deps = packageJson[depType]
        if (deps && packageName in deps) {
          const declaredVersionRange = deps[packageName]
          const versionRange = await resolveVersionRange(
            declaredVersionRange,
            packageName,
            workspaceInfo,
          )

          return {
            declaredVersionRange,
            dependencyType: depType,
            packageJsonPath,
            versionRange,
          }
        }
      }
    }

    // Stop at workspace root
    if (currentDir === workspaceInfo.root) {
      break
    }

    currentDir = path.dirname(currentDir)
  }

  return null
}

/**
 * Finds if a package has an override/resolution defined in the workspace root.
 * Checks npm overrides, yarn resolutions, and pnpm overrides.
 */
export async function findPackageOverride(
  packageName: SanityPackage,
  workspaceInfo: WorkspaceInfo,
): Promise<PackageOverride | null> {
  const rootPackageJsonPath = path.join(workspaceInfo.root, 'package.json')
  const packageJson = await readJsonFile<PackageJson>(rootPackageJsonPath)

  if (!packageJson) {
    return null
  }

  // Check npm/pnpm overrides
  if (packageJson.overrides && packageName in packageJson.overrides) {
    return {
      mechanism: 'npm-overrides',
      packageJsonPath: rootPackageJsonPath,
      versionRange: packageJson.overrides[packageName],
    }
  }

  // Check pnpm.overrides (alternative location)
  if (packageJson.pnpm?.overrides && packageName in packageJson.pnpm.overrides) {
    return {
      mechanism: 'pnpm-overrides',
      packageJsonPath: rootPackageJsonPath,
      versionRange: packageJson.pnpm.overrides[packageName],
    }
  }

  // Check yarn resolutions
  if (packageJson.resolutions && packageName in packageJson.resolutions) {
    return {
      mechanism: 'yarn-resolutions',
      packageJsonPath: rootPackageJsonPath,
      versionRange: packageJson.resolutions[packageName],
    }
  }

  return null
}

/**
 * Finds installed package in node_modules, walking up from startDir.
 * Also extracts \@sanity/cli dependency range from sanity package if applicable.
 *
 * Handles both hoisted (npm/yarn) and nested (pnpm) node_modules structures.
 */
export async function findInstalledPackage(
  packageName: SanityPackage,
  startDir: string,
): Promise<InstalledPackage | null> {
  let currentDir = path.resolve(startDir)
  const fsRoot = path.parse(currentDir).root

  while (currentDir !== fsRoot) {
    // First, check the top-level node_modules (works for npm, yarn, and hoisted pnpm)
    const result = await findPackageInNodeModules(
      packageName,
      path.join(currentDir, 'node_modules'),
    )
    if (result) {
      return result
    }

    // For @sanity/cli, use Node's module resolution from sanity's location.
    // This handles all package manager layouts (pnpm nested deps, hoisting, etc.)
    if (packageName === '@sanity/cli') {
      const sanityPath = await resolvePackagePath(path.join(currentDir, 'node_modules', 'sanity'))
      if (sanityPath) {
        const nestedResult = await resolveCliFromSanity(sanityPath)
        if (nestedResult) {
          return nestedResult
        }
      }
    }

    currentDir = path.dirname(currentDir)
  }

  return null
}

/**
 * Looks for a package in a specific node_modules directory.
 */
async function findPackageInNodeModules(
  packageName: SanityPackage,
  nodeModulesDir: string,
): Promise<InstalledPackage | null> {
  const packagePath = path.join(nodeModulesDir, packageName)
  const resolvedPath = await resolvePackagePath(packagePath)

  if (!resolvedPath) {
    return null
  }

  const packageJsonPath = path.join(resolvedPath, 'package.json')
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath)

  if (!packageJson?.version) {
    return null
  }

  let cliDependencyRange: string | null = null

  // If this is the sanity package, extract @sanity/cli dependency
  if (packageName === 'sanity') {
    cliDependencyRange = packageJson.dependencies?.['@sanity/cli'] ?? null
  }

  return {
    cliDependencyRange,
    path: resolvedPath,
    version: packageJson.version,
  }
}

/**
 * Resolves a package path, following symlinks (pnpm uses symlinks).
 * Returns null if the path doesn't exist.
 */
async function resolvePackagePath(packagePath: string): Promise<string | null> {
  try {
    // Use realpath to follow symlinks (important for pnpm)
    return await fs.realpath(packagePath)
  } catch {
    return null
  }
}

/**
 * Uses Node's module resolution to find \@sanity/cli from sanity's location.
 * This is more robust than manually traversing directories as it handles
 * all package manager layouts (pnpm nested deps, hoisting variations, etc.)
 */
async function resolveCliFromSanity(sanityPath: string): Promise<InstalledPackage | null> {
  try {
    // Resolve @sanity/cli/package.json from sanity's perspective
    const sanityPkgUrl = pathToFileURL(path.join(sanityPath, 'package.json')).href
    const cliPkgUrl = resolveImport('@sanity/cli/package.json', sanityPkgUrl)
    const cliPkgPath = fileURLToPath(cliPkgUrl)
    const cliPath = path.dirname(cliPkgPath)

    const packageJson = await readJsonFile<PackageJson>(cliPkgPath)
    if (!packageJson?.version) {
      return null
    }

    return {
      cliDependencyRange: null,
      path: cliPath,
      version: packageJson.version,
    }
  } catch {
    return null
  }
}

/**
 * Collects all package info (declaration, override, installed) for a package.
 */
export async function collectPackageInfo(
  packageName: SanityPackage,
  startDir: string,
  workspaceInfo: WorkspaceInfo,
): Promise<PackageInfo> {
  const [declared, override, installed] = await Promise.all([
    findPackageDeclaration(packageName, startDir, workspaceInfo),
    findPackageOverride(packageName, workspaceInfo),
    findInstalledPackage(packageName, startDir),
  ])

  return {declared, installed, override}
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}
