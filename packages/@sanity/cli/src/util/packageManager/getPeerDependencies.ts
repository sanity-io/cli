import spawn from 'nano-spawn'

import {getPartialEnvWithNpmPath} from './packageManagerChoice.js'

/**
 * Resolves the peer dependencies of a package by querying the npm registry.
 *
 * @param packageName - Package name with version (e.g. "next-sanity\@11")
 * @param cwd - Working directory (used to resolve local npm paths)
 * @returns Array of peer dependency strings (e.g. ["next\@^15.0.0", "react\@^19.0.0"])
 */
export async function getPeerDependencies(packageName: string, cwd: string): Promise<string[]> {
  let stdout: string
  try {
    const result = await spawn('npm', ['view', packageName, 'peerDependencies', '--json'], {
      cwd,
      env: getPartialEnvWithNpmPath(cwd),
    })
    stdout = result.stdout
  } catch (error) {
    throw new Error(`Failed to resolve peer dependencies for ${packageName}`, {cause: error})
  }

  if (!stdout.trim()) {
    return []
  }

  try {
    const peerDeps: Record<string, string> | null = JSON.parse(stdout)
    if (!peerDeps || typeof peerDeps !== 'object') {
      return []
    }
    return Object.entries(peerDeps).map(([name, range]) => `${name}@${range}`)
  } catch (error) {
    throw new Error(`Failed to resolve peer dependencies for ${packageName}`, {cause: error})
  }
}
