import {execa} from 'execa'

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
    const result = await execa('npm', ['view', packageName, 'peerDependencies', '--json'], {
      cwd,
      encoding: 'utf8',
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
    const peerDeps: Record<string, string> = JSON.parse(stdout)
    return Object.entries(peerDeps).map(([name, range]) => `${name}@${range}`)
  } catch (error) {
    throw new Error(`Failed to resolve peer dependencies for ${packageName}`, {cause: error})
  }
}
