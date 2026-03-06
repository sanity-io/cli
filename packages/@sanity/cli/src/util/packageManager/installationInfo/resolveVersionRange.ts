import fs from 'node:fs/promises'
import path from 'node:path'

import yaml from 'yaml'

import {type WorkspaceInfo} from './types.js'

interface PnpmWorkspaceConfig {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
  packages?: string[]
}

/**
 * Resolves a version range that may use special protocols like `catalog:` or `catalog:name`.
 *
 * @param declaredRange - The version range as declared in package.json
 * @param packageName - The name of the package (needed for catalog lookup)
 * @param workspaceInfo - Workspace configuration for finding catalog definitions
 * @returns The resolved version range, or the original if it can't be resolved
 */
export async function resolveVersionRange(
  declaredRange: string,
  packageName: string,
  workspaceInfo: WorkspaceInfo,
): Promise<string> {
  // Handle catalog: protocol (pnpm workspaces)
  if (declaredRange.startsWith('catalog:')) {
    return resolveCatalogRange(declaredRange, packageName, workspaceInfo)
  }

  // Other protocols (workspace:*, etc.) are returned as-is
  // They're handled differently in the dependency resolution
  return declaredRange
}

async function resolveCatalogRange(
  declaredRange: string,
  packageName: string,
  workspaceInfo: WorkspaceInfo,
): Promise<string> {
  // Parse catalog name from "catalog:" or "catalog:name"
  const catalogName = declaredRange.slice('catalog:'.length) || 'default'

  // Read pnpm-workspace.yaml from workspace root
  const pnpmWorkspacePath = path.join(workspaceInfo.root, 'pnpm-workspace.yaml')

  try {
    const content = await fs.readFile(pnpmWorkspacePath, 'utf8')
    const config = yaml.parse(content) as PnpmWorkspaceConfig

    // pnpm supports the default catalog in two places:
    // 1. Top-level `catalog:` key
    // 2. Under `catalogs: { default: { ... } }`
    const version =
      catalogName === 'default'
        ? (config.catalog?.[packageName] ?? config.catalogs?.['default']?.[packageName])
        : config.catalogs?.[catalogName]?.[packageName]

    if (version) {
      return version
    }
  } catch {
    // Failed to read or parse pnpm-workspace.yaml
  }

  // Couldn't resolve - return original
  return declaredRange
}
